// POST /api/auth/passkey/register/verify — finish adding a passkey.
//
// AUTHENTICATED. Body: { response: <attestation from startRegistration()>,
// name?: string }. The challenge inside clientDataJSON must match an
// unconsumed "register" challenge issued to THIS user; the row is deleted on
// first use either way (single-shot).

import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  relyingParty,
  consumeChallenge,
  challengeFromClientData,
  defaultCredentialName,
  toPasskeySummary,
} from "@/lib/auth/passkeys";
import { apiError, unauthenticated, invalidInput } from "@/lib/api/errors";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const body = await req.json().catch(() => null);
  const response = body?.response;
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null;
  const challenge = challengeFromClientData(response?.response?.clientDataJSON);
  if (!response || !challenge) {
    return invalidInput();
  }

  const consumed = await consumeChallenge(challenge, "register");
  if (!consumed.ok || consumed.userId !== session.userId) {
    return apiError(401, "Invalid or expired passkey challenge");
  }

  const { rpID, expectedOrigin } = relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("[passkey:register-verify]", err);
    return apiError(401, "Passkey registration could not be verified");
  }
  if (!verification.verified || !verification.registrationInfo) {
    return apiError(401, "Passkey registration could not be verified");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const saved = await prisma.webAuthnCredential.create({
    data: {
      userId: session.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name ?? defaultCredentialName(credentialDeviceType, credentialBackedUp),
    },
  });

  return NextResponse.json({ ok: true, passkey: toPasskeySummary(saved) });
}
