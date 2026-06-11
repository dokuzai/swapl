// /api/auth/passkey/* — hermetic route tests. The @simplewebauthn/server
// ceremony functions are mocked (no real attestation/assertion crypto); the
// challenge lifecycle (store → consume-and-delete, TTL, type/user binding)
// runs through the REAL lib/auth/passkeys against an in-memory prisma stub,
// so single-use and expiry semantics are tested end to end.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHALLENGE_TTL_MS } from "@/lib/auth/passkeys";

const mocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  getSessionFromRequest: vi.fn(),
  setSession: vi.fn(),
  issueAuthToken: vi.fn(),
  checkRateLimit: vi.fn(),
  userFindUnique: vi.fn(),
  credCreate: vi.fn(),
  credFindUnique: vi.fn(),
  credUpdate: vi.fn(),
  credDeleteMany: vi.fn(),
}));

// In-memory WebAuthnChallenge table — real consume-and-delete semantics.
type ChallengeRow = {
  id: string;
  challenge: string;
  userId: string | null;
  type: string;
  expiresAt: Date;
  createdAt: Date;
};
const challengeRows = vi.hoisted(() => new Map<string, ChallengeRow>());

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
  setSession: mocks.setSession,
  issueAuthToken: mocks.issueAuthToken,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...real, checkRateLimit: mocks.checkRateLimit };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    webAuthnCredential: {
      create: mocks.credCreate,
      findUnique: mocks.credFindUnique,
      update: mocks.credUpdate,
      deleteMany: mocks.credDeleteMany,
    },
    webAuthnChallenge: {
      create: async ({ data }: { data: Omit<ChallengeRow, "id" | "createdAt"> }) => {
        const row: ChallengeRow = {
          id: `ch_${challengeRows.size}_${Math.random().toString(36).slice(2)}`,
          createdAt: new Date(),
          ...data,
        };
        challengeRows.set(row.challenge, row);
        return row;
      },
      findUnique: async ({ where }: { where: { challenge: string } }) =>
        challengeRows.get(where.challenge) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        for (const [key, row] of challengeRows) {
          if (row.id === where.id) challengeRows.delete(key);
        }
      },
      deleteMany: async () => {
        // TTL sweep — drop expired rows like the real query would.
        for (const [key, row] of challengeRows) {
          if (row.expiresAt < new Date()) challengeRows.delete(key);
        }
        return { count: 0 };
      },
    },
  },
}));

import { POST as registerOptionsPOST } from "@/app/api/auth/passkey/register/options/route";
import { POST as registerVerifyPOST } from "@/app/api/auth/passkey/register/verify/route";
import { POST as loginOptionsPOST } from "@/app/api/auth/passkey/login/options/route";
import { POST as loginVerifyPOST } from "@/app/api/auth/passkey/login/verify/route";

function req(url: string, body?: unknown) {
  return new Request(`http://test${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.9.0.1" },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

/** Base64url clientDataJSON embedding a challenge, like a real authenticator. */
function clientData(challenge: string): string {
  return Buffer.from(
    JSON.stringify({ type: "webauthn.get", challenge, origin: "http://localhost:3000" })
  ).toString("base64url");
}

function assertionBody(challenge: string, extra: Record<string, unknown> = {}) {
  return {
    id: "cred-b64u",
    rawId: "cred-b64u",
    type: "public-key",
    response: { clientDataJSON: clientData(challenge), authenticatorData: "x", signature: "y" },
    clientExtensionResults: {},
    ...extra,
  };
}

const storedCredential = (counter: bigint) => ({
  id: "wc1",
  credentialId: "cred-b64u",
  publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
  counter,
  transports: JSON.stringify(["internal"]),
  user: {
    id: "u1",
    email: "ada@example.com",
    name: "Ada",
    avatar: null,
    emailVerifiedAt: new Date(),
    suspendedAt: null,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  challengeRows.clear();
  mocks.checkRateLimit.mockReturnValue({ ok: true, remaining: 1, resetAt: 0 });
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u1", email: "ada@example.com" });
  mocks.setSession.mockResolvedValue(undefined);
  mocks.issueAuthToken.mockResolvedValue({
    token: "raw-bearer",
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
  });
  mocks.generateRegistrationOptions.mockResolvedValue({ challenge: "reg-chal-1", rp: {} });
  mocks.generateAuthenticationOptions.mockResolvedValue({ challenge: "login-chal-1" });
  mocks.verifyRegistrationResponse.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: "cred-b64u",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ["internal"],
      },
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
    },
  });
  mocks.verifyAuthenticationResponse.mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 5 },
  });
  mocks.userFindUnique.mockResolvedValue({
    id: "u1",
    email: "ada@example.com",
    name: "Ada",
    webauthnCredentials: [{ credentialId: "old-cred", transports: JSON.stringify(["hybrid"]) }],
  });
  mocks.credCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "wc-new",
    name: data.name,
    deviceType: data.deviceType,
    backedUp: data.backedUp,
    createdAt: new Date("2026-06-12T00:00:00.000Z"),
    lastUsedAt: null,
    ...data,
  }));
  mocks.credFindUnique.mockResolvedValue(storedCredential(BigInt(0)));
  mocks.credUpdate.mockResolvedValue({});
  mocks.credDeleteMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/auth/passkey/register/options", () => {
  it("requires a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await registerOptionsPOST(req("/api/auth/passkey/register/options"))).status).toBe(401);
  });

  it("returns options excluding existing credentials and stores the challenge", async () => {
    const res = await registerOptionsPOST(req("/api/auth/passkey/register/options"));
    expect(res.status).toBe(200);
    expect((await res.json()).challenge).toBe("reg-chal-1");
    expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: "localhost",
        userName: "ada@example.com",
        excludeCredentials: [{ id: "old-cred", transports: ["hybrid"] }],
      })
    );
    const row = challengeRows.get("reg-chal-1");
    expect(row).toMatchObject({ type: "register", userId: "u1" });
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + CHALLENGE_TTL_MS);
  });
});

describe("POST /api/auth/passkey/register/verify", () => {
  const verifyBody = (challenge = "reg-chal-1") => ({
    response: { id: "cred-b64u", response: { clientDataJSON: clientData(challenge) } },
    name: "Mac",
  });

  async function seedRegisterChallenge() {
    await registerOptionsPOST(req("/api/auth/passkey/register/options"));
  }

  it("saves the credential with the device name", async () => {
    await seedRegisterChallenge();
    const res = await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.passkey).toMatchObject({ id: "wc-new", name: "Mac", backedUp: true });
    expect(mocks.credCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        credentialId: "cred-b64u",
        publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
        counter: BigInt(0),
        deviceType: "multiDevice",
        backedUp: true,
        name: "Mac",
      }),
    });
  });

  it("consumes the challenge exactly once (replay → 401)", async () => {
    await seedRegisterChallenge();
    expect((await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()))).status).toBe(200);
    expect((await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()))).status).toBe(401);
    expect(mocks.credCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects a challenge issued to a different user", async () => {
    await seedRegisterChallenge(); // stored for u1
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u2", email: "eve@example.com" });
    const res = await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()));
    expect(res.status).toBe(401);
    expect(mocks.verifyRegistrationResponse).not.toHaveBeenCalled();
    // ...and the burned challenge can't be retried by the right user either.
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u1", email: "ada@example.com" });
    expect((await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()))).status).toBe(401);
  });

  it("rejects an expired challenge", async () => {
    await seedRegisterChallenge();
    challengeRows.get("reg-chal-1")!.expiresAt = new Date(Date.now() - 1000);
    const res = await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()));
    expect(res.status).toBe(401);
    expect(mocks.credCreate).not.toHaveBeenCalled();
  });

  it("rejects when the library does not verify the attestation", async () => {
    await seedRegisterChallenge();
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });
    const res = await registerVerifyPOST(req("/api/auth/passkey/register/verify", verifyBody()));
    expect(res.status).toBe(401);
    expect(mocks.credCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/passkey/login/options", () => {
  it("returns usernameless options and stores an anonymous login challenge", async () => {
    const res = await loginOptionsPOST(req("/api/auth/passkey/login/options"));
    expect(res.status).toBe(200);
    expect((await res.json()).challenge).toBe("login-chal-1");
    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ rpID: "localhost", allowCredentials: [] })
    );
    expect(challengeRows.get("login-chal-1")).toMatchObject({ type: "login", userId: null });
  });

  it("is rate limited", async () => {
    mocks.checkRateLimit.mockReturnValue({ ok: false, remaining: 0, resetAt: 0 });
    expect((await loginOptionsPOST(req("/api/auth/passkey/login/options"))).status).toBe(429);
    expect(mocks.generateAuthenticationOptions).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/passkey/login/verify", () => {
  async function seedLoginChallenge() {
    await loginOptionsPOST(req("/api/auth/passkey/login/options"));
  }

  it("resolves the user from the credential and sets the web cookie", async () => {
    await seedLoginChallenge();
    const res = await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, userId: "u1", emailVerified: true });
    expect(mocks.setSession).toHaveBeenCalledWith({ userId: "u1", email: "ada@example.com", name: "Ada" });
    expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "login-chal-1",
        expectedOrigin: "http://localhost:3000",
        expectedRPID: "localhost",
        credential: expect.objectContaining({ id: "cred-b64u", counter: 0 }),
      })
    );
    // platform/appVersion must NOT leak into the assertion handed to the lib.
    expect(mocks.verifyAuthenticationResponse.mock.calls[0][0].response.platform).toBeUndefined();
    expect(mocks.credUpdate).toHaveBeenCalledWith({
      where: { id: "wc1" },
      data: expect.objectContaining({ counter: BigInt(5), lastUsedAt: expect.any(Date) }),
    });
  });

  it("issues a bearer token when platform is sent (native)", async () => {
    await seedLoginChallenge();
    const res = await loginVerifyPOST(
      req("/api/auth/passkey/login/verify", assertionBody("login-chal-1", { platform: "ios", appVersion: "1.2.0" }))
    );
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("raw-bearer");
    expect(mocks.issueAuthToken).toHaveBeenCalledWith("u1", "ios", "1.2.0");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("consumes the challenge exactly once (replay → 401)", async () => {
    await seedLoginChallenge();
    expect((await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")))).status).toBe(200);
    expect((await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")))).status).toBe(401);
    expect(mocks.setSession).toHaveBeenCalledTimes(1);
  });

  it("rejects an expired challenge", async () => {
    await seedLoginChallenge();
    challengeRows.get("login-chal-1")!.expiresAt = new Date(Date.now() - 1000);
    const res = await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")));
    expect(res.status).toBe(401);
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("rejects a register challenge presented to login (type binding)", async () => {
    await registerOptionsPOST(req("/api/auth/passkey/register/options")); // stores "reg-chal-1"
    const res = await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("reg-chal-1")));
    expect(res.status).toBe(401);
  });

  it("rejects a counter regression (possible cloned credential)", async () => {
    await seedLoginChallenge();
    mocks.credFindUnique.mockResolvedValue(storedCredential(BigInt(10)));
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });
    const res = await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")));
    expect(res.status).toBe(401);
    expect(mocks.credUpdate).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("accepts 0 → 0 counters (authenticators without counters)", async () => {
    await seedLoginChallenge();
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    });
    expect((await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")))).status).toBe(200);
  });

  it("answers a uniform 401 for an unknown credential id", async () => {
    await seedLoginChallenge();
    mocks.credFindUnique.mockResolvedValue(null);
    const res = await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")));
    expect(res.status).toBe(401);
  });

  it("blocks suspended accounts", async () => {
    await seedLoginChallenge();
    const cred = storedCredential(BigInt(0));
    cred.user.suspendedAt = new Date() as never;
    mocks.credFindUnique.mockResolvedValue(cred);
    expect((await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("login-chal-1")))).status).toBe(403);
  });

  it("is rate limited", async () => {
    mocks.checkRateLimit.mockReturnValue({ ok: false, remaining: 0, resetAt: 0 });
    expect((await loginVerifyPOST(req("/api/auth/passkey/login/verify", assertionBody("x")))).status).toBe(429);
  });
});
