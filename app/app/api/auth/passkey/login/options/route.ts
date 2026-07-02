// POST /api/auth/passkey/login/options — start a usernameless passkey login.
//
// Anonymous + rate limited. allowCredentials stays empty: the browser offers
// whatever discoverable credentials it holds for this RP and the assertion's
// credential id resolves the account in /login/verify.

import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { relyingParty, storeChallenge } from "@/lib/auth/passkeys";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, serverError } from "@/lib/api/errors";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`passkey-login-options:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }

  const { rpID } = relyingParty();
  try {
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [], // usernameless / discoverable
      userVerification: "preferred",
    });
    await storeChallenge(options.challenge, "login");
    return NextResponse.json(options);
  } catch (err) {
    console.error("[passkey:login-options]", err);
    return serverError();
  }
}
