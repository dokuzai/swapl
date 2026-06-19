// POST /api/auth/oauth/google — sign in with a Google ID token.
//
// The client (GIS on web, GoogleSignIn on iOS/Android) obtains an ID token
// and posts it here. We verify it against Google's JWKS (see
// lib/auth/oauth/google.ts for the rationale), then find-or-create the user
// (link-by-verified-email, never duplicate) and emit the SAME session as the
// password flows: cookie for web, bearer for native.

import { prisma } from "@/lib/db";
import { oauthGoogleSchema } from "@/lib/validators";
import { verifyGoogleIdToken } from "@/lib/auth/oauth/google";
import { googleClientIds } from "@/lib/auth/oauth/config";
import { findOrCreateOAuthUser } from "@/lib/auth/oauth/account";
import { respondWithSession } from "@/lib/auth/respond";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput } from "@/lib/api/errors";
import {
  attributeSignupByCode,
  linkRefereeByEmail,
  linkRefereeByInviteToken,
} from "@/lib/growth/referrals";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const clientIds = googleClientIds();
  if (clientIds.length === 0) {
    return apiError(503, "Google sign-in is not configured on this deployment.");
  }

  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`oauth-google:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }

  const body = await req.json().catch(() => null);
  const parsed = oauthGoogleSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }

  const verified = await verifyGoogleIdToken(parsed.data.idToken, clientIds);
  if (!verified.ok) {
    return apiError(401, "Invalid Google token");
  }

  const user = await findOrCreateOAuthUser({
    provider: "google",
    providerUserId: verified.identity.providerUserId,
    email: verified.identity.email,
    emailVerified: true, // enforced by verifyGoogleIdToken
    name: verified.identity.name,
    avatar: verified.identity.avatar,
  });
  if (user.suspendedAt) {
    return accountSuspended();
  }

  // Keep the waitlist funnel measurable, like /api/auth/register.
  if (user.created) {
    await prisma.betaSignup
      .updateMany({ where: { email: user.email, userId: null }, data: { userId: user.id } })
      .catch((err: unknown) => console.error("[oauth-google:link-beta-signup]", err));

    // Growth engine (DOK-157): referral attribution on first-time signup. The
    // reward credits later, on identity verification (anti-farm gate).
    try {
      if (parsed.data.ref) await attributeSignupByCode(user.id, parsed.data.ref);
      if (parsed.data.invite) await linkRefereeByInviteToken(user.id, parsed.data.invite);
      await linkRefereeByEmail(user.id, user.email);
    } catch (err) {
      console.error("[oauth-google:referral-attribution]", err);
    }
  }

  return respondWithSession(user, parsed.data.platform, parsed.data.appVersion);
}
