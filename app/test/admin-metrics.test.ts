// lib/admin/metrics.ts — listings-per-user distribution, city shares,
// proposal conversion, and the zero states. Prisma is mocked so the
// aggregation logic runs hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  listingCount: vi.fn(),
  listingGroupBy: vi.fn(),
  proposalGroupBy: vi.fn(),
  agreementCount: vi.fn(),
  messageCount: vi.fn(),
  favoriteCount: vi.fn(),
  savedSearchCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    listing: { count: mocks.listingCount, groupBy: mocks.listingGroupBy },
    swapProposal: { groupBy: mocks.proposalGroupBy },
    swapAgreement: { count: mocks.agreementCount },
    swapMessage: { count: mocks.messageCount },
    favorite: { count: mocks.favoriteCount },
    savedSearch: { count: mocks.savedSearchCount },
  },
}));

import { getAdminMetrics, ONLINE_WINDOW_MS } from "@/lib/admin/metrics";

const NOW = new Date("2026-06-11T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: an empty platform. Individual tests override what they need.
  mocks.userCount.mockResolvedValue(0);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.listingCount.mockResolvedValue(0);
  mocks.listingGroupBy.mockResolvedValue([]);
  mocks.proposalGroupBy.mockResolvedValue([]);
  mocks.agreementCount.mockResolvedValue(0);
  mocks.messageCount.mockResolvedValue(0);
  mocks.favoriteCount.mockResolvedValue(0);
  mocks.savedSearchCount.mockResolvedValue(0);
});

describe("getAdminMetrics", () => {
  it("handles an empty database without dividing by zero", async () => {
    const m = await getAdminMetrics(NOW);
    expect(m.now).toEqual({ online: 0, dau: 0, wau: 0, mau: 0 });
    expect(m.listingsPerUser.distribution).toEqual({ zero: 0, one: 0, two: 0, threePlus: 0 });
    expect(m.listingsPerUser.avgPerUserWithListing).toBe(0);
    expect(m.listingsPerUser.topUsers).toEqual([]);
    expect(m.cities.top).toEqual([]);
    expect(m.engagement.proposalAcceptRate).toBe(0);
    // No top users → the user lookup is skipped entirely.
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("queries the online window with lastActiveAt >= now - 15 min", async () => {
    await getAdminMetrics(NOW);
    const expected = new Date(NOW.getTime() - ONLINE_WINDOW_MS);
    expect(mocks.userCount).toHaveBeenCalledWith({
      where: { lastActiveAt: { gte: expected } },
    });
  });

  it("computes the listings-per-user distribution, average and top hosts", async () => {
    // user.count is called 9 times; the 5th call (no args) is the total.
    mocks.userCount.mockImplementation(async (args?: { where?: unknown }) =>
      args === undefined ? 10 : 3
    );
    mocks.listingGroupBy.mockImplementation(async (args: { by: string[] }) => {
      if (args.by[0] === "userId") {
        return [
          { userId: "u-1", _count: { _all: 4 } },
          { userId: "u-2", _count: { _all: 1 } },
          { userId: "u-3", _count: { _all: 2 } },
          { userId: "u-4", _count: { _all: 1 } },
        ];
      }
      return [];
    });
    mocks.userFindMany.mockResolvedValue([
      { id: "u-1", name: "Asli", email: "asli@demo.swapl" },
      { id: "u-2", name: null, email: "maartje@demo.swapl" },
      { id: "u-3", name: "Haruki", email: "haruki@demo.swapl" },
      { id: "u-4", name: "Ines", email: "ines@demo.swapl" },
    ]);

    const m = await getAdminMetrics(NOW);
    expect(m.listingsPerUser.distribution).toEqual({ zero: 6, one: 2, two: 1, threePlus: 1 });
    expect(m.listingsPerUser.avgPerUserWithListing).toBe(2); // 8 listings / 4 hosts
    expect(m.listingsPerUser.topUsers[0]).toEqual({
      id: "u-1",
      name: "Asli",
      email: "asli@demo.swapl",
      listings: 4,
    });
    expect(m.listingsPerUser.topUsers).toHaveLength(4);
    // Sorted descending by listing count.
    expect(m.listingsPerUser.topUsers.map((u) => u.listings)).toEqual([4, 2, 1, 1]);
  });

  it("computes city shares against total active listings", async () => {
    mocks.listingCount.mockResolvedValue(20);
    mocks.listingGroupBy.mockImplementation(async (args: { by: string[] }) => {
      if (args.by[0] === "city") {
        return [
          { city: "Lisbon", _count: { _all: 10 } },
          { city: "Istanbul", _count: { _all: 5 } },
        ];
      }
      return [];
    });

    const m = await getAdminMetrics(NOW);
    expect(m.cities.totalActiveListings).toBe(20);
    expect(m.cities.top).toEqual([
      { city: "Lisbon", listings: 10, share: 0.5 },
      { city: "Istanbul", listings: 5, share: 0.25 },
    ]);
  });

  it("computes the proposal acceptance rate from the status breakdown", async () => {
    mocks.proposalGroupBy.mockResolvedValue([
      { status: "PENDING", _count: { _all: 5 } },
      { status: "ACCEPTED", _count: { _all: 3 } },
      { status: "DECLINED", _count: { _all: 2 } },
    ]);

    const m = await getAdminMetrics(NOW);
    expect(m.engagement.proposalsTotal).toBe(10);
    expect(m.engagement.proposalAcceptRate).toBeCloseTo(0.3);
    expect(m.engagement.proposalsByStatus).toEqual({ PENDING: 5, ACCEPTED: 3, DECLINED: 2 });
  });
});
