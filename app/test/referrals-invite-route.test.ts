// POST /api/referrals/invite-to-stay (DOK-157): auth, ownership of the listing,
// rate limit, and the happy path returning a shareable token link. Mocks the
// prisma + session + rate-limit surface the route touches.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "host", email: "h@swapl.test", name: "H" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  checkRateLimitDurable: vi.fn(),
  listingFindUnique: vi.fn(),
  referralCreate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDurable: mocks.checkRateLimitDurable }));
vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: mocks.listingFindUnique },
    referral: { create: mocks.referralCreate },
  },
}));

import { POST } from "@/app/api/referrals/invite-to-stay/route";

function post(body: unknown) {
  return POST(
    new Request("https://swapl.test/api/referrals/invite-to-stay", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true });
  mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "host", title: "Loft" });
  mocks.referralCreate.mockImplementation(({ data }: any) => ({
    id: "ref_1",
    token: data.token,
  }));
});

describe("POST /api/referrals/invite-to-stay", () => {
  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await post({ listingId: "L1" })).status).toBe(401);
  });

  it("400 without a listingId", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("creates an invite tied to the caller's listing (happy path)", async () => {
    const res = await post({ listingId: "L1", email: "Friend@X.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, referralId: "ref_1" });
    expect(body.shareUrl).toContain("invite=");
    const createArg = mocks.referralCreate.mock.calls[0][0].data;
    expect(createArg).toMatchObject({
      ownerId: "host",
      source: "invite_to_stay",
      listingId: "L1",
      refereeEmail: "friend@x.com", // normalised
      status: "pending",
    });
    expect(createArg.token).toBeTruthy();
  });

  it("404 when the listing does not exist", async () => {
    mocks.listingFindUnique.mockResolvedValue(null);
    expect((await post({ listingId: "L9" })).status).toBe(404);
  });

  it("403 when the listing is not yours", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "someone-else", title: "X" });
    const res = await post({ listingId: "L1" });
    expect(res.status).toBe(403);
    expect(mocks.referralCreate).not.toHaveBeenCalled();
  });

  it("429 when rate-limited", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false });
    expect((await post({ listingId: "L1" })).status).toBe(429);
  });
});
