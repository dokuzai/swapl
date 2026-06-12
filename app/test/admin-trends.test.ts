// lib/admin/metrics.ts — daily trend buckets behind the /admin/metrics charts
// (DOK-151). Prisma is mocked; bucketByDay is pure so most cases run on it
// directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  listingFindMany: vi.fn(),
  proposalFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    listing: { findMany: mocks.listingFindMany },
    swapProposal: { findMany: mocks.proposalFindMany },
  },
}));

import { bucketByDay, getDailyTrends, TREND_DAYS } from "@/lib/admin/metrics";

const NOW = new Date("2026-06-12T15:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindMany.mockResolvedValue([]);
  mocks.listingFindMany.mockResolvedValue([]);
  mocks.proposalFindMany.mockResolvedValue([]);
});

describe("bucketByDay", () => {
  it("returns one zeroed bucket per day, oldest first, ending today (UTC)", () => {
    const buckets = bucketByDay([], 3, NOW);
    expect(buckets).toEqual([
      { day: "2026-06-10", count: 0 },
      { day: "2026-06-11", count: 0 },
      { day: "2026-06-12", count: 0 },
    ]);
  });

  it("counts dates into their UTC day and ignores dates outside the window", () => {
    const buckets = bucketByDay(
      [
        new Date("2026-06-12T00:00:01.000Z"),
        new Date("2026-06-12T23:59:59.000Z"),
        new Date("2026-06-11T12:00:00.000Z"),
        new Date("2026-06-09T12:00:00.000Z"), // before the 3-day window
        new Date("2026-06-13T12:00:00.000Z"), // after "today"
      ],
      3,
      NOW
    );
    expect(buckets).toEqual([
      { day: "2026-06-10", count: 0 },
      { day: "2026-06-11", count: 1 },
      { day: "2026-06-12", count: 2 },
    ]);
  });
});

describe("getDailyTrends", () => {
  it("queries each model since the start of the window and buckets the rows", async () => {
    mocks.userFindMany.mockResolvedValue([{ createdAt: new Date("2026-06-12T01:00:00.000Z") }]);
    mocks.proposalFindMany.mockResolvedValue([
      { createdAt: new Date("2026-06-01T01:00:00.000Z") },
      { createdAt: new Date("2026-06-01T02:00:00.000Z") },
    ]);

    const t = await getDailyTrends(NOW);

    expect(t.days).toBe(TREND_DAYS);
    expect(t.users).toHaveLength(TREND_DAYS);
    expect(t.users.at(-1)).toEqual({ day: "2026-06-12", count: 1 });
    expect(t.listings.every((b) => b.count === 0)).toBe(true);
    expect(t.proposals.find((b) => b.day === "2026-06-01")?.count).toBe(2);

    // Window starts TREND_DAYS-1 days before today at UTC midnight.
    const since = new Date("2026-05-14T00:00:00.000Z");
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
  });
});
