// Apple identity-token verification (Sign in with Apple).
//
// Same approach as Google: local JWKS verification via `jose` against
// https://appleid.apple.com/auth/keys. Apple only includes `email` in the
// token on the FIRST authorization; later sign-ins carry just `sub`, so the
// caller resolves the user by OAuthAccount(provider="apple", sub) before
// ever needing the email. The verifier is injectable for hermetic tests.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { JwtVerifier, VerifyResult } from "./google";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const defaultVerifier: JwtVerifier = async (identityToken) => {
  jwks ??= createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  const { payload } = await jwtVerify(identityToken, jwks, { issuer: APPLE_ISSUER });
  return payload;
};

export type AppleIdentity = {
  providerUserId: string; // Apple `sub`
  // Present only on the first authorization (or when Apple chooses to resend).
  email: string | null;
  // Apple's email_verified can be a boolean or the string "true".
  emailVerified: boolean;
};

export async function verifyAppleIdentityToken(
  identityToken: string,
  allowedBundleIds: string[],
  verifier: JwtVerifier = defaultVerifier
): Promise<VerifyResult<AppleIdentity>> {
  if (allowedBundleIds.length === 0) return { ok: false, reason: "not-configured" };
  let payload: JWTPayload;
  try {
    payload = await verifier(identityToken);
  } catch {
    return { ok: false, reason: "invalid-signature" };
  }
  if (payload.iss !== APPLE_ISSUER) return { ok: false, reason: "invalid-issuer" };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => typeof a === "string" && allowedBundleIds.includes(a))) {
    return { ok: false, reason: "invalid-audience" };
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub) return { ok: false, reason: "missing-sub" };
  const email = typeof payload.email === "string" && payload.email ? payload.email : null;
  const ev = payload.email_verified;
  const emailVerified = ev === true || ev === "true";
  return {
    ok: true,
    identity: { providerUserId: sub, email, emailVerified },
  };
}
