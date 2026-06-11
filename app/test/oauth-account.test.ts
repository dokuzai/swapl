// findOrCreateOAuthUser — the unified identity model: resolve by provider
// identity, link by verified email, otherwise create. Never duplicates.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  oauthFindUnique: vi.fn(),
  oauthCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    oAuthAccount: { findUnique: mocks.oauthFindUnique, create: mocks.oauthCreate },
    user: { findUnique: mocks.userFindUnique, create: mocks.userCreate, update: mocks.userUpdate },
  },
}));

import { findOrCreateOAuthUser } from "@/lib/auth/oauth/account";

const baseUser = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  avatar: null,
  suspendedAt: null,
  emailVerifiedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.oauthFindUnique.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.oauthCreate.mockResolvedValue({});
});

describe("findOrCreateOAuthUser", () => {
  it("returns the linked user for a returning provider identity", async () => {
    mocks.oauthFindUnique.mockResolvedValue({ user: baseUser });
    const res = await findOrCreateOAuthUser({
      provider: "google",
      providerUserId: "g1",
      email: "different@example.com", // ignored: provider identity wins
      emailVerified: true,
    });
    expect(res.id).toBe("u1");
    expect(res.created).toBe(false);
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.oauthCreate).not.toHaveBeenCalled();
  });

  it("links the provider to an existing user with the same verified email", async () => {
    mocks.userFindUnique.mockResolvedValue(baseUser);
    const res = await findOrCreateOAuthUser({
      provider: "google",
      providerUserId: "g1",
      email: "Ada@Example.com", // normalised before lookup
      emailVerified: true,
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { email: "ada@example.com" } });
    expect(mocks.oauthCreate).toHaveBeenCalledWith({
      data: { userId: "u1", provider: "google", providerUserId: "g1" },
    });
    expect(res.id).toBe("u1");
    expect(res.created).toBe(false);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("backfills emailVerifiedAt when linking to a never-verified account", async () => {
    mocks.userFindUnique.mockResolvedValue({ ...baseUser, emailVerifiedAt: null });
    mocks.userUpdate.mockResolvedValue({ ...baseUser, emailVerifiedAt: new Date() });
    await findOrCreateOAuthUser({
      provider: "google",
      providerUserId: "g1",
      email: "ada@example.com",
      emailVerified: true,
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
    });
  });

  it("NEVER links by email when the provider did not verify it", async () => {
    mocks.userFindUnique.mockResolvedValue(baseUser); // would match by email
    mocks.userCreate.mockResolvedValue({
      ...baseUser,
      id: "u2",
      email: "tg42@telegram.local",
      emailVerifiedAt: null,
    });
    const res = await findOrCreateOAuthUser({
      provider: "telegram",
      providerUserId: "42",
      email: "tg42@telegram.local",
      emailVerified: false,
    });
    // Skips the email-link branch entirely.
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(res.created).toBe(true);
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ emailVerifiedAt: null }),
    });
  });

  it("creates a new user with emailVerifiedAt for provider-verified emails", async () => {
    mocks.userCreate.mockResolvedValue({ ...baseUser, id: "u3" });
    const res = await findOrCreateOAuthUser({
      provider: "apple",
      providerUserId: "a1",
      email: "new@example.com",
      emailVerified: true,
      name: "New User",
    });
    expect(res.created).toBe(true);
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@example.com",
        name: "New User",
        emailVerifiedAt: expect.any(Date),
        oauthAccounts: { create: { provider: "apple", providerUserId: "a1" } },
      }),
    });
  });
});
