// POST /api/auth/oauth/google — route behaviour: 503 gate, session shape
// parity with /api/auth/login and /api/auth/token, suspension.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
  findOrCreateOAuthUser: vi.fn(),
  setSession: vi.fn(),
  issueAuthToken: vi.fn(),
  betaUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth/oauth/google", () => ({
  verifyGoogleIdToken: mocks.verifyGoogleIdToken,
}));
vi.mock("@/lib/auth/oauth/account", () => ({
  findOrCreateOAuthUser: mocks.findOrCreateOAuthUser,
}));
vi.mock("@/lib/auth/session", () => ({
  setSession: mocks.setSession,
  issueAuthToken: mocks.issueAuthToken,
}));
vi.mock("@/lib/db", () => ({
  prisma: { betaSignup: { updateMany: mocks.betaUpdateMany } },
}));

import { POST } from "@/app/api/auth/oauth/google/route";

function req(body: unknown) {
  return new Request("http://test/api/auth/oauth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(body),
  });
}

const resolvedUser = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  avatar: null,
  suspendedAt: null,
  emailVerifiedAt: new Date(),
  created: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_OAUTH_CLIENT_IDS = "web-client-id,ios-client-id";
  mocks.verifyGoogleIdToken.mockResolvedValue({
    ok: true,
    identity: {
      providerUserId: "g1",
      email: "ada@example.com",
      emailVerified: true,
      name: "Ada",
      avatar: null,
    },
  });
  mocks.findOrCreateOAuthUser.mockResolvedValue(resolvedUser);
  mocks.setSession.mockResolvedValue(undefined);
  mocks.issueAuthToken.mockResolvedValue({
    token: "raw-bearer",
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
  });
  mocks.betaUpdateMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
});

const idToken = "x".repeat(40);

describe("POST /api/auth/oauth/google", () => {
  it("returns 503 when GOOGLE_OAUTH_CLIENT_IDS is unset", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
    const res = await POST(req({ idToken }));
    expect(res.status).toBe(503);
  });

  it("web (no platform): sets the cookie session, login-shaped body", async () => {
    const res = await POST(req({ idToken }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, userId: "u1", emailVerified: true });
    expect(mocks.setSession).toHaveBeenCalledWith({
      userId: "u1",
      email: "ada@example.com",
      name: "Ada",
    });
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });

  it("native (platform=ios): issues a bearer, token-shaped body", async () => {
    const res = await POST(req({ idToken, platform: "ios", appVersion: "1.2.0" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      token: "raw-bearer",
      expiresAt: "2026-12-31T00:00:00.000Z",
      user: { id: "u1", email: "ada@example.com", name: "Ada", avatar: null },
    });
    expect(mocks.issueAuthToken).toHaveBeenCalledWith("u1", "ios", "1.2.0");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid token with 401 and no session", async () => {
    mocks.verifyGoogleIdToken.mockResolvedValue({ ok: false, reason: "invalid-audience" });
    const res = await POST(req({ idToken }));
    expect(res.status).toBe(401);
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  it("blocks suspended accounts with 403", async () => {
    mocks.findOrCreateOAuthUser.mockResolvedValue({ ...resolvedUser, suspendedAt: new Date() });
    const res = await POST(req({ idToken }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ACCOUNT_SUSPENDED");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("links the beta-waitlist row for newly created users", async () => {
    mocks.findOrCreateOAuthUser.mockResolvedValue({ ...resolvedUser, created: true });
    await POST(req({ idToken }));
    expect(mocks.betaUpdateMany).toHaveBeenCalledWith({
      where: { email: "ada@example.com", userId: null },
      data: { userId: "u1" },
    });
  });
});
