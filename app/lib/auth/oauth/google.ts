// Google ID-token verification.
//
// Strategy: verify the JWT signature locally against Google's JWKS via `jose`
// (already in the workspace lockfile) instead of calling Google's tokeninfo
// endpoint. Local JWKS verification avoids a per-login network round-trip to
// an endpoint Google documents as "debug only", caches keys between logins,
// and keeps latency/availability in our hands. The JWKS set is fetched and
// cached by jose's createRemoteJWKSet with standard cache headers.
//
// The actual cryptographic verifier is injectable so tests can exercise the
// claim checks (iss / aud / email_verified) hermetically without minting
// Google-signed JWTs.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Verifies signature + exp and returns the raw payload. Throws on failure. */
export type JwtVerifier = (idToken: string) => Promise<JWTPayload>;

const defaultVerifier: JwtVerifier = async (idToken) => {
  jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  // jose checks signature + exp/nbf; issuer is constrained here, audience is
  // checked below against the comma-separated client-id list.
  const { payload } = await jwtVerify(idToken, jwks, { issuer: GOOGLE_ISSUERS });
  return payload;
};

export type GoogleIdentity = {
  providerUserId: string; // Google `sub`
  email: string;
  emailVerified: true;
  name: string | null;
  avatar: string | null;
};

export type VerifyResult<T> = { ok: true; identity: T } | { ok: false; reason: string };

export async function verifyGoogleIdToken(
  idToken: string,
  allowedClientIds: string[],
  verifier: JwtVerifier = defaultVerifier
): Promise<VerifyResult<GoogleIdentity>> {
  if (allowedClientIds.length === 0) return { ok: false, reason: "not-configured" };
  let payload: JWTPayload;
  try {
    payload = await verifier(idToken);
  } catch {
    return { ok: false, reason: "invalid-signature" };
  }
  if (typeof payload.iss !== "string" || !GOOGLE_ISSUERS.includes(payload.iss)) {
    return { ok: false, reason: "invalid-issuer" };
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => typeof a === "string" && allowedClientIds.includes(a))) {
    return { ok: false, reason: "invalid-audience" };
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== "string" || !sub) return { ok: false, reason: "missing-sub" };
  if (typeof email !== "string" || !email) return { ok: false, reason: "missing-email" };
  // Identity model: we link providers to local accounts by email, so we MUST
  // refuse tokens whose email Google hasn't verified (account-takeover vector).
  if (payload.email_verified !== true) return { ok: false, reason: "email-not-verified" };
  return {
    ok: true,
    identity: {
      providerUserId: sub,
      email,
      emailVerified: true,
      name: typeof payload.name === "string" ? payload.name : null,
      avatar: typeof payload.picture === "string" ? payload.picture : null,
    },
  };
}
