// POST /api/auth/passkey/register/options — start adding a passkey.
//
// AUTHENTICATED: a passkey is always attached to an existing account (there
// is no passkey *sign-up*; every other login flow can create the account
// first). Returns standard WebAuthn creation options; the challenge is
// persisted server-side for the matching /register/verify call.

import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { relyingParty, storeChallenge } from "@/lib/auth/passkeys";
import { unauthenticated, serverError } from "@/lib/api/errors";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { webauthnCredentials: { select: { credentialId: true, transports: true } } },
  });
  if (!user) return unauthenticated();

  const { rpID, rpName } = relyingParty();
  try {
    const options = await generateRegistrationOptions({
      rpID,
      rpName,
      userName: user.email,
      userDisplayName: user.name ?? user.email,
      attestationType: "none",
      // Don't let the user enroll the same authenticator twice.
      excludeCredentials: user.webauthnCredentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: "required", // discoverable → usernameless login works
        userVerification: "preferred",
      },
    });
    await storeChallenge(options.challenge, "register", user.id);
    return NextResponse.json(options);
  } catch (err) {
    console.error("[passkey:register-options]", err);
    return serverError();
  }
}
