// POST /api/keys/stays/{id}/review (JRN-GP-01) — party / completed / unique
// gating, input validation, rate limiting, subject flip, best-effort notify.
// Prisma + session + rate limit + notifiers + earn hook are mocked so the route
// logic runs hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const guestSession = { userId: "u-guest", email: "guest@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  stayFindUnique: vi.fn(),
  reviewCreate: vi.fn(),
  checkRateLimitDurable: vi.fn(),
  grantReviewBonus: vi.fn(async () => {}),
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: { keysStay: { findUnique: mocks.stayFindUnique }, swapReview: { create: mocks.reviewCreate } },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitDurable: mocks.checkRateLimitDurable,
  checkRateLimit: vi.fn(),
  clientIpFromRequest: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/keys/earn", () => ({ grantReviewBonus: mocks.grantReviewBonus }));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { reviewReceived: vi.fn((to: string, n: string, r: number) => ({ to, n, r })) },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { reviewReceived: vi.fn((n: string, r: number) => ({ n, r })) },
}));

import { POST } from "@/app/api/keys/stays/[id]/review/route";

const VALID_TEXT = "A lovely stay — the flat was spotless and central.";

const completedStay = {
  id: "stay-1",
  status: "completed",
  guestId: "u-guest",
  hostId: "u-host",
  listingId: "L1",
  guest: { email: "guest@swapl.test" },
  host: { email: "host@swapl.test" },
};

function post(body: unknown, session: typeof guestSession | { userId: string } | null = guestSession, id = "stay-1") {
  mocks.getSessionFromRequest.mockResolvedValue(session);
  return POST(
    new Request(`https://swapl.test/api/keys/stays/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true, resetAt: 0 });
  mocks.stayFindUnique.mockResolvedValue(completedStay);
  mocks.reviewCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "rev-1",
    createdAt: new Date("2026-07-20T00:00:00Z"),
    ...data,
  }));
});

describe("POST /api/keys/stays/[id]/review", () => {
  it("401 without a session", async () => {
    expect((await post({ rating: 5, text: VALID_TEXT }, null)).status).toBe(401);
  });

  it("guest reviews a completed stay → 201, subject is the host", async () => {
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(201);
    expect(mocks.reviewCreate).toHaveBeenCalledWith({
      data: {
        keysStayId: "stay-1",
        authorId: "u-guest",
        subjectId: "u-host",
        listingId: "L1",
        rating: 5,
        text: VALID_TEXT,
      },
    });
    expect((await res.json()).review.keysStayId).toBe("stay-1");
  });

  it("host reviews → subject flips to the guest", async () => {
    await post({ rating: 4, text: VALID_TEXT }, { userId: "u-host" });
    expect(mocks.reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subjectId: "u-guest", authorId: "u-host" }) })
    );
  });

  it("cannot review a confirmed-but-not-completed stay → 422", async () => {
    mocks.stayFindUnique.mockResolvedValue({ ...completedStay, status: "confirmed" });
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(422);
    expect(mocks.reviewCreate).not.toHaveBeenCalled();
  });

  it("cannot double-review (unique violation → 409)", async () => {
    mocks.reviewCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect((await post({ rating: 5, text: VALID_TEXT })).status).toBe(409);
  });

  it("403s a non-party", async () => {
    const res = await post({ rating: 5, text: VALID_TEXT }, { userId: "u-stranger" });
    expect(res.status).toBe(403);
    expect(mocks.reviewCreate).not.toHaveBeenCalled();
  });

  it("404 when the stay does not exist", async () => {
    mocks.stayFindUnique.mockResolvedValue(null);
    expect((await post({ rating: 5, text: VALID_TEXT })).status).toBe(404);
  });

  it("rejects invalid input (rating/text bounds)", async () => {
    expect((await post({ rating: 6, text: VALID_TEXT })).status).toBe(400);
    expect((await post({ rating: 5, text: "too short" })).status).toBe(400);
    expect(mocks.reviewCreate).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false, resetAt: 0 });
    expect((await post({ rating: 5, text: VALID_TEXT })).status).toBe(429);
  });

  it("still 201 when notifications fail (best-effort)", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("smtp"));
    mocks.sendPush.mockRejectedValue(new Error("fcm"));
    expect((await post({ rating: 5, text: VALID_TEXT })).status).toBe(201);
  });
});
