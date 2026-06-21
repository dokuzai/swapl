// POST /api/proposals — date-vs-availability guard (DOK-219). A swap is
// simultaneous, so the requested range must be free on BOTH homes. The route
// calls isAvailable for each side; here we drive those return values and assert
// the route rejects with 400 (and never creates the proposal) when either home
// isn't open, and proceeds when both are.

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
  checkRateLimitDurable: vi.fn(),
  sendEmail: vi.fn(),
  sendPush: vi.fn(),
  isAvailable: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    organizationMember: { findFirst: mocks.orgMemberFindFirst },
    subscription: { findUnique: mocks.subscriptionFindUnique },
    listing: { findUnique: mocks.listingFindUnique },
    swapProposal: { create: mocks.proposalCreate },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDurable: mocks.checkRateLimitDurable }));
vi.mock("@/lib/listing/availability", () => ({ isAvailable: mocks.isAvailable }));
// Plan gate is covered elsewhere; here it always passes so we isolate the date guard.
vi.mock("@/lib/billing/limits", () => ({
  ensureCanCreateProposal: vi.fn().mockResolvedValue(undefined),
  PlanLimitError: class PlanLimitError extends Error {},
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
  // Suspension check, then getEffectivePlan role lookup, then counter read.
  mocks.userFindUnique.mockImplementation(({ select }: { select: Record<string, true> }) => {
    if (select?.suspendedAt) return Promise.resolve({ suspendedAt: null });
    if (select?.role) return Promise.resolve({ role: "member" });
    return Promise.resolve({ proposalsThisMonthCount: 0, proposalsCounterResetAt: new Date() });
  });
  mocks.orgMemberFindFirst.mockResolvedValue(null);
  mocks.subscriptionFindUnique.mockResolvedValue(null);
  mocks.userUpdate.mockResolvedValue({});
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.sendPush.mockResolvedValue(undefined);
  mocks.listingFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === "l-mine"
        ? { id: "l-mine", userId: "u-1", sleeps: 4 }
        : { id: "l-theirs", userId: "u-2", city: "Lisbon", sleeps: 2, user: { email: "ben@swapl.test" } }
    )
  );
  mocks.proposalCreate.mockResolvedValue({ id: "p-1" });
});

describe("POST /api/proposals availability guard", () => {
  it("rejects when the target home isn't open for the dates", async () => {
    // target (l-theirs) unavailable, own home fine.
    mocks.isAvailable.mockImplementation((listing: { id: string }) =>
      Promise.resolve(listing.id !== "l-theirs")
    );
    const res = await post();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/aren't available for that home/i);
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it("rejects when the proposer's own home isn't open for the dates", async () => {
    mocks.isAvailable.mockImplementation((listing: { id: string }) =>
      Promise.resolve(listing.id !== "l-mine")
    );
    const res = await post();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/your home isn't available/i);
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it("creates the proposal when both homes are open", async () => {
    mocks.isAvailable.mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, id: "p-1" });
    expect(mocks.proposalCreate).toHaveBeenCalledTimes(1);
  });
});

function postWithGuests(guestCount: number) {
  return POST(
    new Request("https://swapl.test/api/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proposerListingId: "l-mine",
        targetListingId: "l-theirs",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-08",
        guestCount,
        message: "Swap?",
      }),
    })
  );
}

describe("POST /api/proposals guest-count guard (DOK-219)", () => {
  it("rejects a group larger than the target home's capacity", async () => {
    mocks.isAvailable.mockResolvedValue(true);
    const res = await postWithGuests(5); // target sleeps 2
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/sleeps 2/i);
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it("accepts a group that fits and stores the guest count", async () => {
    mocks.isAvailable.mockResolvedValue(true);
    const res = await postWithGuests(2);
    expect(res.status).toBe(200);
    expect(mocks.proposalCreate).toHaveBeenCalledTimes(1);
    expect(mocks.proposalCreate.mock.calls[0][0].data).toMatchObject({ guestCount: 2 });
  });
});
