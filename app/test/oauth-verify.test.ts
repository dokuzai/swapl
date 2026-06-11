// Google / Apple token claim checks — hermetic via the injectable verifier
// (the default verifier does remote JWKS crypto; here we inject a fake that
// returns a payload, and assert the iss/aud/exp/email_verified gates).

import { describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import { verifyGoogleIdToken } from "@/lib/auth/oauth/google";
import { verifyAppleIdentityToken } from "@/lib/auth/oauth/apple";

const now = () => Math.floor(Date.now() / 1000);

function fakeVerifier(payload: JWTPayload) {
  return async () => payload;
}

const GOOGLE_AUDS = ["web-client-id", "ios-client-id"];

function googlePayload(overrides: Partial<JWTPayload> = {}): JWTPayload {
  return {
    iss: "https://accounts.google.com",
    aud: "ios-client-id",
    sub: "g-sub-1",
    exp: now() + 3600,
    email: "ada@example.com",
    email_verified: true,
    name: "Ada",
    picture: "https://lh3.googleusercontent.com/x",
    ...overrides,
  };
}

describe("verifyGoogleIdToken", () => {
  it("accepts a valid payload and maps the identity", async () => {
    const res = await verifyGoogleIdToken("tok", GOOGLE_AUDS, fakeVerifier(googlePayload()));
    expect(res).toEqual({
      ok: true,
      identity: {
        providerUserId: "g-sub-1",
        email: "ada@example.com",
        emailVerified: true,
        name: "Ada",
        avatar: "https://lh3.googleusercontent.com/x",
      },
    });
  });

  it("accepts the bare accounts.google.com issuer", async () => {
    const res = await verifyGoogleIdToken(
      "tok",
      GOOGLE_AUDS,
      fakeVerifier(googlePayload({ iss: "accounts.google.com" }))
    );
    expect(res.ok).toBe(true);
  });

  it("rejects an audience outside GOOGLE_OAUTH_CLIENT_IDS", async () => {
    const res = await verifyGoogleIdToken(
      "tok",
      GOOGLE_AUDS,
      fakeVerifier(googlePayload({ aud: "someone-elses-client" }))
    );
    expect(res).toEqual({ ok: false, reason: "invalid-audience" });
  });

  it("rejects a wrong issuer", async () => {
    const res = await verifyGoogleIdToken(
      "tok",
      GOOGLE_AUDS,
      fakeVerifier(googlePayload({ iss: "https://evil.example" }))
    );
    expect(res).toEqual({ ok: false, reason: "invalid-issuer" });
  });

  it("rejects an expired token", async () => {
    const res = await verifyGoogleIdToken(
      "tok",
      GOOGLE_AUDS,
      fakeVerifier(googlePayload({ exp: now() - 10 }))
    );
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects unverified emails (link-by-email safety)", async () => {
    const res = await verifyGoogleIdToken(
      "tok",
      GOOGLE_AUDS,
      fakeVerifier(googlePayload({ email_verified: false }))
    );
    expect(res).toEqual({ ok: false, reason: "email-not-verified" });
  });

  it("fails closed when the verifier throws (bad signature)", async () => {
    const res = await verifyGoogleIdToken("tok", GOOGLE_AUDS, async () => {
      throw new Error("signature verification failed");
    });
    expect(res).toEqual({ ok: false, reason: "invalid-signature" });
  });

  it("fails when no client ids are configured", async () => {
    const res = await verifyGoogleIdToken("tok", [], fakeVerifier(googlePayload()));
    expect(res).toEqual({ ok: false, reason: "not-configured" });
  });
});

const APPLE_AUDS = ["fun.swapl.app", "fun.swapl.web"];

function applePayload(overrides: Partial<JWTPayload> = {}): JWTPayload {
  return {
    iss: "https://appleid.apple.com",
    aud: "fun.swapl.app",
    sub: "apple-sub-1",
    exp: now() + 3600,
    email: "ada@privaterelay.appleid.com",
    email_verified: "true",
    ...overrides,
  };
}

describe("verifyAppleIdentityToken", () => {
  it("accepts a first-authorization payload with email", async () => {
    const res = await verifyAppleIdentityToken("tok", APPLE_AUDS, fakeVerifier(applePayload()));
    expect(res).toEqual({
      ok: true,
      identity: {
        providerUserId: "apple-sub-1",
        email: "ada@privaterelay.appleid.com",
        emailVerified: true,
      },
    });
  });

  it("accepts later sign-ins where Apple omits the email", async () => {
    const res = await verifyAppleIdentityToken(
      "tok",
      APPLE_AUDS,
      fakeVerifier(applePayload({ email: undefined, email_verified: undefined }))
    );
    expect(res).toEqual({
      ok: true,
      identity: { providerUserId: "apple-sub-1", email: null, emailVerified: false },
    });
  });

  it("rejects wrong issuer and wrong audience", async () => {
    expect(
      await verifyAppleIdentityToken("tok", APPLE_AUDS, fakeVerifier(applePayload({ iss: "https://accounts.google.com" })))
    ).toEqual({ ok: false, reason: "invalid-issuer" });
    expect(
      await verifyAppleIdentityToken("tok", APPLE_AUDS, fakeVerifier(applePayload({ aud: "com.other.app" })))
    ).toEqual({ ok: false, reason: "invalid-audience" });
  });

  it("rejects expired tokens and fails closed on verifier errors", async () => {
    expect(
      await verifyAppleIdentityToken("tok", APPLE_AUDS, fakeVerifier(applePayload({ exp: now() - 5 })))
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      await verifyAppleIdentityToken("tok", APPLE_AUDS, async () => {
        throw new Error("bad sig");
      })
    ).toEqual({ ok: false, reason: "invalid-signature" });
  });
});
