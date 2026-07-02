// SEC-AUTH-02: the signed web cookie carries the user's sessionEpoch at issue,
// and getSession() rejects a cookie whose epoch is behind the user's current
// epoch (bumped on password change/reset and suspend). Drives the module-private
// encode/decode through the public setSession → getSession pair, mocking
// next/headers cookies() (a shared in-memory store) and the prisma epoch read.

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();
const mocks = vi.hoisted(() => ({ userFindUnique: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookieStore.has(n) ? { value: cookieStore.get(n) } : undefined),
    set: (n: string, v: string) => void cookieStore.set(n, v),
    delete: (n: string) => void cookieStore.delete(n),
  }),
}));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.userFindUnique } } }));
vi.mock("@/lib/auth/activity", () => ({ touchLastActive: vi.fn() }));

import { getSession, setSession } from "@/lib/auth/session";

const payload = { userId: "u1", email: "u@swapl.test", name: "U" };

beforeEach(() => {
  cookieStore.clear();
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "a-strong-test-secret-at-least-32-chars-long");
});

// Issue a cookie while the user is at `issueEpoch`, then read while the user is
// at `readEpoch` (a bump between the two simulates a password change / suspend).
async function issueThenRead(issueEpoch: number, readEpoch: number) {
  mocks.userFindUnique.mockResolvedValueOnce({ sessionEpoch: issueEpoch });
  await setSession(payload);
  mocks.userFindUnique.mockResolvedValueOnce({ sessionEpoch: readEpoch });
  return getSession();
}

describe("session epoch revocation", () => {
  it("accepts a fresh cookie whose epoch matches the user", async () => {
    const s = await issueThenRead(0, 0);
    expect(s).toEqual(payload);
  });

  it("rejects a cookie whose epoch is behind a bumped user epoch", async () => {
    // Issued at epoch 0; user later bumped to 1 (password change) → stale.
    expect(await issueThenRead(0, 1)).toBeNull();
  });

  it("accepts a cookie re-issued AFTER a bump (re-login works)", async () => {
    // Cookie minted while the user is already at epoch 1, read at epoch 1.
    expect(await issueThenRead(1, 1)).toEqual(payload);
  });

  it("grandfathers a legacy cookie (no epoch field) as 0 — valid until the first bump", async () => {
    // Craft a genuinely epoch-LESS cookie (a pre-feature cookie) by building the
    // body without `epoch` and re-signing with the same HMAC secret the module
    // uses. This exercises the `decoded.epoch ?? 0` coercion directly.
    const secret = "a-strong-test-secret-at-least-32-chars-long";
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Date.now() + 60_000 }), // no `epoch` key
    ).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    cookieStore.set("swapl_session", `${body}.${sig}`);

    // Missing epoch coerces to 0: valid while the user is at epoch 0…
    mocks.userFindUnique.mockResolvedValueOnce({ sessionEpoch: 0 });
    expect(await getSession()).toEqual(payload);
    // …and rejected once the user's epoch is bumped above it.
    mocks.userFindUnique.mockResolvedValueOnce({ sessionEpoch: 1 });
    expect(await getSession()).toBeNull();
  });

  it("rejects when the user no longer exists", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ sessionEpoch: 0 });
    await setSession(payload);
    mocks.userFindUnique.mockResolvedValueOnce(null);
    expect(await getSession()).toBeNull();
  });
});
