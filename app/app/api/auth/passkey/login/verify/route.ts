// POST /api/auth/passkey/login/verify — exchange a passkey assertion for a
// session.
//
// Anonymous + rate limited. Body: { ...assertion from startAuthentication(),
// platform?, appVersion? } — assertion fields spread at the top level, same
// convention as every other login endpoint. The credential id resolves the
// user (usernameless), the embedded challenge must match an unconsumed
// "login" challenge (single-shot), and a non-increasing signature counter is
// rejected as a possible cloned authenticator. Emits the SAME session as the
// password flow via lib/auth/respond.ts.

import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import {
  relyingParty,
  consumeChallenge,
  challengeFromClientData,
} from "@/lib/auth/passkeys";
import { respondWithSession, type Platform } from "@/lib/auth/respond";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput } from "@/lib/api/errors";

const MIN_MS = 60 * 1000;
const PLATFORMS = ["ios", "android", "web-pwa"] as const;

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = checkRateLimit(`passkey-login-verify:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return invalidInput();
  const { platform: rawPlatform, appVersion: rawAppVersion, ...assertion } = body as Record<
    string,
    unknown
  >;
  const platform = PLATFORMS.includes(rawPlatform as Platform) ? (rawPlatform as Platform) : undefined;
  const appVersion = typeof rawAppVersion === "string" ? rawAppVersion : undefined;

  const credentialId = typeof assertion.id === "string" ? assertion.id : null;
  const clientDataJSON = (assertion as { response?: { clientDataJSON?: unknown } }).response
    ?.clientDataJSON;
  const challenge = challengeFromClientData(clientDataJSON);
  if (!credentialId || !challenge) return invalidInput();

  // Burn the challenge FIRST: even a verification crash can't leave it reusable.
  const consumed = await consumeChallenge(challenge, "login");
  if (!consumed.ok) {
    return apiError(401, "Invalid or expired passkey challenge");
  }

  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId },
    include: { user: true },
  });
  // Deliberately uniform 401: don't leak whether a credential id exists.
  if (!credential) return apiError(401, "Passkey sign-in failed");
  if (credential.user.suspendedAt) return accountSuspended();

  const { rpID, expectedOrigin } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      // The route validated only what it consumes; the library strictly
      // validates the full assertion shape.
      response: assertion as unknown as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, "base64url"),
        counter: Number(credential.counter),
        transports: credential.transports ? JSON.parse(credential.transports) : undefined,
      },
    });
  } catch (err) {
    console.error("[passkey:login-verify]", err);
    return apiError(401, "Passkey sign-in failed");
  }
  if (!verification.verified) return apiError(401, "Passkey sign-in failed");

  // Counter regression → possible cloned credential. Authenticators that
  // don't implement counters always report 0, so 0 → 0 stays acceptable.
  const newCounter = BigInt(verification.authenticationInfo.newCounter);
  if (credential.counter > BigInt(0) && newCounter <= credential.counter) {
    console.warn("[passkey:login-verify] counter regression", {
      credentialId: credential.id,
    });
    return apiError(401, "Passkey sign-in failed");
  }

  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });

  return respondWithSession(credential.user, platform, appVersion);
}
