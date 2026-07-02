// POST /api/proposals — plan-limit gate with the admin bypass. The real
// lib/billing/limits logic runs against a mocked Prisma so the route is
// exercised end-to-end: a free member over the monthly cap still gets the
// 402 upsell, while a swapl_admin over the same cap sails through.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  orgMemberFindFirst: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  listingFindUnique: vi.fn(),
  proposalCreate: vi.fn(),
  checkRateLimit: vi.fn(),
  sendEmail: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    organizationMember: { findFirst: mocks.orgMemberFindFirst },
    subscription: { findUnique: mocks.subscriptionFindUnique },
    listing: { findUnique: mocks.listingFindUnique },
    swapProposal: { create: mocks.proposalCreate },
    // Availability check reached via the real proposals POST — no bookings here.
    swapAgreement: { findMany: vi.fn(async () => []) },
    keysStay: { findMany: vi.fn(async () => []) },
    listingBlockedRange: { findMany: vi.fn(async () => []) },
  };
  // Plan-limit counter runs inside a transaction; pass the same fake client.
  prisma.$transaction = (fn: any) => (typeof fn === "function" ? fn(prisma) : Promise.all(fn));
  return { prisma };
});
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitDurable: mocks.checkRateLimit,
  checkRateLimit: mocks.checkRateLimit,
  clientIpFromRequest: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { proposalReceived: vi.fn(() => ({})) },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { proposalReceived: vi.fn(() => ({})) },
}));

import { POST } from "@/app/api/proposals/route";

// user.findUnique is hit three times on this path with different selects:
// the route's suspension check, getEffectivePlan's role lookup, and the
// proposal-counter read. Dispatch on the requested columns.
function stubUser(opts: { role: "member" | "swapl_admin"; proposalsThisMonthCount: number }) {
  mocks.userFindUnique.mockImplementation(({ select }: { select: Record<string, true> }) => {
    if (select?.suspendedAt) return Promise.resolve({ suspendedAt: null });
    if (select?.role) return Promise.resolve({ role: opts.role });
    return Promise.resolve({
      proposalsThisMonthCount: opts.proposalsThisMonthCount,
      proposalsCounterResetAt: new Date(),
    });
  });
}

function post() {
  return POST(
    new Request("https://swapl.test/api/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proposerListingId: "l-mine",
        targetListingId: "l-theirs",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-08",
        message: "Swap?",
      }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.orgMemberFindFirst.mockResolvedValue(null);
  mocks.subscriptionFindUnique.mockResolvedValue(null);
  mocks.userUpdate.mockResolvedValue({});
  mocks.checkRateLimit.mockResolvedValue({ ok: true });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.sendPush.mockResolvedValue(undefined);
  mocks.listingFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === "l-mine"
        ? { id: "l-mine", userId: "u-1" }
        : { id: "l-theirs", userId: "u-2", city: "Lisbon", user: { email: "ben@swapl.test" } }
    )
  );
  mocks.proposalCreate.mockResolvedValue({ id: "p-1" });
});

describe("POST /api/proposals plan gate", () => {
  it("returns 402 with the upsell payload for a free member over the monthly cap", async () => {
    stubUser({ role: "member", proposalsThisMonthCount: 3 });
    const res = await post();
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json).toMatchObject({ upgradeTo: "plus", currentPlan: "free" });
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it("lets an admin over the free cap create the proposal", async () => {
    stubUser({ role: "swapl_admin", proposalsThisMonthCount: 3 });
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, id: "p-1" });
    expect(mocks.proposalCreate).toHaveBeenCalledTimes(1);
  });

  it("still allows a free member under the cap", async () => {
    stubUser({ role: "member", proposalsThisMonthCount: 2 });
    const res = await post();
    expect(res.status).toBe(200);
  });
});
