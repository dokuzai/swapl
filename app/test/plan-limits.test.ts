import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the lazy Prisma proxy with stubs so the plan-resolution logic can be
// exercised without a database. The factory must be self-contained — vitest
// hoists vi.mock above the imports.
vi.mock("@/lib/db", () => {
  const prisma: any = {
    organizationMember: { findFirst: vi.fn() },
    subscription: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    listing: { count: vi.fn() },
  };
  // ensureCanCreateProposal now wraps read+reset+increment in a transaction;
  // run the callback against the same fake client (the tests stub user.*).
  prisma.$transaction = (fn: any) => (typeof fn === "function" ? fn(prisma) : Promise.all(fn));
  return { prisma };
});

import { prisma } from "@/lib/db";
import {
  ensureCanCreateListing,
  ensureCanCreateProposal,
  getEffectivePlan,
  PLAN_IDS,
  PLAN_LIMITS,
  PlanLimitError,
} from "@/lib/billing/limits";

type Stub = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  organizationMember: { findFirst: Stub };
  subscription: { findUnique: Stub };
  user: { findUnique: Stub; update: Stub };
  listing: { count: Stub };
};

beforeEach(() => {
  vi.clearAllMocks();
  db.organizationMember.findFirst.mockResolvedValue(null);
  db.subscription.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue(null);
  db.user.update.mockResolvedValue({});
  db.listing.count.mockResolvedValue(0);
});

describe("PLAN_LIMITS", () => {
  it("keys each entry by its own id", () => {
    for (const id of PLAN_IDS) expect(PLAN_LIMITS[id].id).toBe(id);
  });

  it("encodes the free-tier caps and pro's unlimited (0) sentinels", () => {
    expect(PLAN_LIMITS.free.maxListings).toBe(1);
    expect(PLAN_LIMITS.free.maxProposalsMonth).toBe(3);
    expect(PLAN_LIMITS.pro.maxListings).toBe(0);
    expect(PLAN_LIMITS.pro.maxProposalsMonth).toBe(0);
  });

  it("encodes the per-tier travel-window caps (Free=3, Plus=10, Pro=unlimited)", () => {
    expect(PLAN_LIMITS.free.maxTravelWindows).toBe(3);
    expect(PLAN_LIMITS.plus.maxTravelWindows).toBe(10);
    expect(PLAN_LIMITS.pro.maxTravelWindows).toBe(0);
  });
});

describe("getEffectivePlan", () => {
  it("returns pro for a member of an active organization", async () => {
    db.organizationMember.findFirst.mockResolvedValue({ org: { planStatus: "active" } });
    expect((await getEffectivePlan("u1")).id).toBe("pro");
  });

  it("ignores an inactive organization and falls through to the subscription", async () => {
    db.organizationMember.findFirst.mockResolvedValue({ org: { planStatus: "canceled" } });
    db.subscription.findUnique.mockResolvedValue({ status: "active", planId: "plus" });
    expect((await getEffectivePlan("u1")).id).toBe("plus");
  });

  it("returns the plan of an active subscription", async () => {
    db.subscription.findUnique.mockResolvedValue({ status: "active", planId: "plus" });
    expect((await getEffectivePlan("u1")).id).toBe("plus");
  });

  it("honours a past_due subscription during its grace period", async () => {
    db.subscription.findUnique.mockResolvedValue({ status: "past_due", planId: "pro" });
    expect((await getEffectivePlan("u1")).id).toBe("pro");
  });

  it("falls back to free for a canceled subscription", async () => {
    db.subscription.findUnique.mockResolvedValue({ status: "canceled", planId: "pro" });
    expect((await getEffectivePlan("u1")).id).toBe("free");
  });

  it("falls back to free for an unknown plan id", async () => {
    db.subscription.findUnique.mockResolvedValue({ status: "active", planId: "enterprise" });
    expect((await getEffectivePlan("u1")).id).toBe("free");
  });

  it("defaults to free with no organization and no subscription", async () => {
    expect((await getEffectivePlan("u1")).id).toBe("free");
  });

  it("returns pro for an admin regardless of subscription or organization", async () => {
    db.user.findUnique.mockResolvedValue({ role: "swapl_admin" });
    expect((await getEffectivePlan("u1")).id).toBe("pro");
    expect(db.organizationMember.findFirst).not.toHaveBeenCalled();
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
  });

  it("does not elevate a regular member based on role", async () => {
    db.user.findUnique.mockResolvedValue({ role: "member" });
    expect((await getEffectivePlan("u1")).id).toBe("free");
  });
});

describe("ensureCanCreateProposal", () => {
  it("allows a free user below the monthly cap", async () => {
    db.user.findUnique.mockResolvedValue({ proposalsThisMonthCount: 2, proposalsCounterResetAt: new Date() });
    await expect(ensureCanCreateProposal("u1")).resolves.toBeUndefined();
  });

  it("blocks a free user at the monthly cap with a PlanLimitError", async () => {
    db.user.findUnique.mockResolvedValue({ proposalsThisMonthCount: 3, proposalsCounterResetAt: new Date() });
    await expect(ensureCanCreateProposal("u1")).rejects.toMatchObject({
      name: "PlanLimitError",
      currentPlan: "free",
      upgradeTo: "plus",
    });
  });

  it("rolls the counter over after 30 days and allows again", async () => {
    const stale = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    db.user.findUnique.mockResolvedValue({ proposalsThisMonthCount: 3, proposalsCounterResetAt: stale });
    await expect(ensureCanCreateProposal("u1")).resolves.toBeUndefined();
    // Rollover path writes twice: reset the stale counter, then increment.
    expect(db.user.update).toHaveBeenCalledTimes(2);
  });

  it("is unlimited for pro members and never reads the counter", async () => {
    db.subscription.findUnique.mockResolvedValue({ status: "active", planId: "pro" });
    await expect(ensureCanCreateProposal("u1")).resolves.toBeUndefined();
    expect(db.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ proposalsThisMonthCount: true }),
      }),
    );
  });

  it("is unlimited for admins even when the counter is over the free cap", async () => {
    db.user.findUnique.mockResolvedValue({ role: "swapl_admin" });
    await expect(ensureCanCreateProposal("u1")).resolves.toBeUndefined();
    expect(db.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ proposalsThisMonthCount: true }),
      }),
    );
  });
});

describe("ensureCanCreateListing", () => {
  it("allows a free user under the listing cap", async () => {
    db.listing.count.mockResolvedValue(0);
    await expect(ensureCanCreateListing("u1")).resolves.toBeUndefined();
  });

  it("blocks a free user at the listing cap", async () => {
    db.listing.count.mockResolvedValue(1);
    await expect(ensureCanCreateListing("u1")).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("is unlimited for pro members and never counts listings", async () => {
    db.subscription.findUnique.mockResolvedValue({ status: "active", planId: "pro" });
    await expect(ensureCanCreateListing("u1")).resolves.toBeUndefined();
    expect(db.listing.count).not.toHaveBeenCalled();
  });

  it("is unlimited for admins and never counts listings", async () => {
    db.user.findUnique.mockResolvedValue({ role: "swapl_admin" });
    db.listing.count.mockResolvedValue(99);
    await expect(ensureCanCreateListing("u1")).resolves.toBeUndefined();
    expect(db.listing.count).not.toHaveBeenCalled();
  });
});
