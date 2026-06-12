// POST /api/agreements/{id}/review — party/COMPLETED/unique gating, input
// validation, rate limiting; plus the canReview flag on GET /api/proposals/{id}.
// Prisma + session + rate limit are mocked so the route logic runs hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  agreementFindUnique: vi.fn(),
  reviewCreate: vi.fn(),
  reviewFindUnique: vi.fn(),
  proposalFindUnique: vi.fn(),
  checkRateLimitDurable: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: { findUnique: mocks.agreementFindUnique },
    swapReview: { create: mocks.reviewCreate, findUnique: mocks.reviewFindUnique },
    swapProposal: { findUnique: mocks.proposalFindUnique },
  },
  parseJSON: (s: string | null, fallback: unknown) => {
    try {
      return s ? JSON.parse(s) : fallback;
    } catch {
      return fallback;
    }
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitDurable: mocks.checkRateLimitDurable,
  checkRateLimit: vi.fn(),
  clientIpFromRequest: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/listing-utils", () => ({ toDTO: vi.fn((l: { id: string }) => ({ id: l.id })) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), emailTemplates: {} }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(), pushTemplates: {} }));
vi.mock("@/lib/insurance", () => ({ insuranceProvider: vi.fn() }));

import { POST as postReview } from "@/app/api/agreements/[id]/review/route";
import { GET as getProposal } from "@/app/api/proposals/[id]/route";

const VALID_TEXT = "A lovely stay, the flat was spotless and central.";

const completedAgreement = {
  id: "ag-1",
  status: "COMPLETED",
  listing1: { userId: "u-1" },
  listing2: { userId: "u-2" },
};

function post(body: unknown, id = "ag-1") {
  return postReview(
    new Request(`https://swapl.test/api/agreements/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true, remaining: 9, resetAt: 0 });
  mocks.agreementFindUnique.mockResolvedValue(completedAgreement);
  mocks.reviewCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "rev-1",
    ...data,
    createdAt: new Date("2026-06-12T00:00:00Z"),
  }));
});

describe("POST /api/agreements/{id}/review", () => {
  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(401);
  });

  it("404 when the agreement does not exist", async () => {
    mocks.agreementFindUnique.mockResolvedValue(null);
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(404);
  });

  it("403 when the caller is not a party of the agreement", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ ...session, userId: "u-99" });
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(403);
    expect(mocks.reviewCreate).not.toHaveBeenCalled();
  });

  it("422 when the agreement is not COMPLETED", async () => {
    mocks.agreementFindUnique.mockResolvedValue({ ...completedAgreement, status: "ACTIVE" });
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(422);
  });

  it.each([
    { rating: 0, text: VALID_TEXT },
    { rating: 6, text: VALID_TEXT },
    { rating: 4.5, text: VALID_TEXT },
    { rating: 5, text: "too short" },
    { rating: 5, text: "x".repeat(1001) },
  ])("400 on invalid input %#", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(mocks.reviewCreate).not.toHaveBeenCalled();
  });

  it("409 on a second review for the same agreement (unique violation)", async () => {
    mocks.reviewCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(409);
  });

  it("429 when rate limited", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false, remaining: 0, resetAt: 1 });
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(429);
  });

  it("201 creates the review with the OTHER party as subject", async () => {
    const res = await post({ rating: 4, text: VALID_TEXT });
    expect(res.status).toBe(201);
    expect(mocks.reviewCreate).toHaveBeenCalledWith({
      data: {
        agreementId: "ag-1",
        authorId: "u-1",
        subjectId: "u-2",
        rating: 4,
        text: VALID_TEXT,
      },
    });
    const json = await res.json();
    expect(json.review).toMatchObject({ id: "rev-1", agreementId: "ag-1", rating: 4 });
  });

  it("subject flips when the caller owns listing2", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ ...session, userId: "u-2" });
    const res = await post({ rating: 5, text: VALID_TEXT });
    expect(res.status).toBe(201);
    expect(mocks.reviewCreate.mock.calls[0][0].data.subjectId).toBe("u-1");
  });
});

describe("GET /api/proposals/{id} canReview flag", () => {
  const baseProposal = {
    id: "p-1",
    status: "ACCEPTED",
    proposerId: "u-1",
    dateFrom: new Date(),
    dateTo: new Date(),
    message: null,
    counterDateFrom: null,
    counterDateTo: null,
    counterMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    proposerListing: { id: "l-1", userId: "u-1", user: { id: "u-1", name: "Ana" } },
    targetListing: { id: "l-2", userId: "u-2", user: { id: "u-2", name: "Ben" } },
    agreement: {
      id: "ag-1",
      status: "COMPLETED",
      dateFrom: new Date(),
      dateTo: new Date(),
      keyCode1: "1111",
      keyCode2: "2222",
      insurancePolicy: null,
    },
  };

  function get(id = "p-1") {
    return getProposal(new Request(`https://swapl.test/api/proposals/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("true when COMPLETED and the caller has not reviewed yet", async () => {
    mocks.proposalFindUnique.mockResolvedValue(baseProposal);
    mocks.reviewFindUnique.mockResolvedValue(null);
    const json = await (await get()).json();
    expect(json.agreement.canReview).toBe(true);
  });

  it("false when the caller already reviewed", async () => {
    mocks.proposalFindUnique.mockResolvedValue(baseProposal);
    mocks.reviewFindUnique.mockResolvedValue({ id: "rev-1" });
    const json = await (await get()).json();
    expect(json.agreement.canReview).toBe(false);
  });

  it("false while the agreement is still ACTIVE", async () => {
    mocks.proposalFindUnique.mockResolvedValue({
      ...baseProposal,
      agreement: { ...baseProposal.agreement, status: "ACTIVE" },
    });
    const json = await (await get()).json();
    expect(json.agreement.canReview).toBe(false);
    expect(mocks.reviewFindUnique).not.toHaveBeenCalled();
  });
});
