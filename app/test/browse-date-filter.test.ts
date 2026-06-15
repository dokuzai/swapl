// Date-filtered browse (DOK-159): GET /api/listings?from&to must exclude any
// listing whose published window doesn't cover the range or that is already
// occupied (active agreement / pending|confirmed Keys stay / host block).
// We assert on the WHERE clause + the JS-side id filtering. Prisma mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindMany: vi.fn(async () => [] as unknown[]),
  listingCount: vi.fn(async () => 0),
  agreementFindMany: vi.fn(async () => [] as unknown[]),
  keysStayFindMany: vi.fn(async () => [] as unknown[]),
  blockedFindMany: vi.fn(async () => [] as unknown[]),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findMany: mocks.listingFindMany, count: mocks.listingCount },
    swapAgreement: { findMany: mocks.agreementFindMany },
    keysStay: { findMany: mocks.keysStayFindMany },
    listingBlockedRange: { findMany: mocks.blockedFindMany },
  },
}));
// toDTO touches JSON fields; give it harmless inputs and don't assert on shape.
vi.mock("@/lib/listing-utils", () => ({
  toDTO: (l: { id: string; city: string }) => ({ id: l.id, city: l.city, isFeatured: false, isVerified: false }),
}));

import { queryListings } from "@/lib/listing-query";
import { FILTER_DEFAULTS } from "@/lib/listing-filters";

function filters(over: Record<string, unknown> = {}) {
  return { ...FILTER_DEFAULTS, sort: "newest" as const, ...over };
}

// The prisma.listing.findMany WHERE clause of the Nth call.
function whereOf(call: number): Record<string, unknown> {
  const args = mocks.listingFindMany.mock.calls[call] as unknown as [{ where: Record<string, unknown> }];
  return args[0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agreementFindMany.mockResolvedValue([]);
  mocks.keysStayFindMany.mockResolvedValue([]);
  mocks.blockedFindMany.mockResolvedValue([]);
  mocks.listingCount.mockResolvedValue(0);
});

describe("queryListings with from & to", () => {
  it("constrains the window to fully cover the requested range", async () => {
    // First findMany = candidate ids; later findMany = paginated rows.
    mocks.listingFindMany
      .mockResolvedValueOnce([{ id: "A" }, { id: "B" }])
      .mockResolvedValueOnce([]);
    await queryListings(filters({ dateFrom: "2026-07-10", dateTo: "2026-07-17" }));

    const candidateWhere = whereOf(0);
    expect(candidateWhere.availableFrom).toEqual({ lte: new Date("2026-07-10") });
    expect(candidateWhere.availableTo).toEqual({ gte: new Date("2026-07-17") });
  });

  it("drops a listing occupied by a pending Keys stay overlapping the range", async () => {
    mocks.listingFindMany
      .mockResolvedValueOnce([{ id: "FREE" }, { id: "TAKEN" }])
      .mockImplementationOnce(async () => []); // paginated rows (unused here)
    mocks.keysStayFindMany.mockResolvedValue([
      { listingId: "TAKEN", dateFrom: new Date("2026-07-12"), dateTo: new Date("2026-07-20") },
    ]);

    await queryListings(filters({ dateFrom: "2026-07-10", dateTo: "2026-07-17" }));

    // The paginated query (2nd call) must restrict to the free id only.
    const pagedWhere = whereOf(1);
    expect(pagedWhere.id).toEqual({ in: ["FREE"] });
  });

  it("keeps a listing whose occupied range does NOT overlap the requested dates", async () => {
    mocks.listingFindMany
      .mockResolvedValueOnce([{ id: "FREE" }])
      .mockImplementationOnce(async () => []);
    mocks.blockedFindMany.mockResolvedValue([
      { listingId: "FREE", dateFrom: new Date("2026-09-01"), dateTo: new Date("2026-09-05") },
    ]);

    await queryListings(filters({ dateFrom: "2026-07-10", dateTo: "2026-07-17" }));
    const pagedWhere = whereOf(1);
    expect(pagedWhere.id).toEqual({ in: ["FREE"] });
  });

  it("an active agreement on either side removes the listing", async () => {
    mocks.listingFindMany
      .mockResolvedValueOnce([{ id: "L1" }])
      .mockImplementationOnce(async () => []);
    mocks.agreementFindMany.mockResolvedValue([
      { listing1Id: "X", listing2Id: "L1", dateFrom: new Date("2026-07-09"), dateTo: new Date("2026-07-12") },
    ]);

    await queryListings(filters({ dateFrom: "2026-07-10", dateTo: "2026-07-17" }));
    const pagedWhere = whereOf(1);
    expect(pagedWhere.id).toEqual({ in: [] });
  });

  it("without both from & to keeps the loose window-overlap filter (no id constraint)", async () => {
    mocks.listingFindMany.mockResolvedValue([]);
    await queryListings(filters({ dateFrom: "2026-07-10", dateTo: null }));
    // Only one findMany (the paginated query) — no candidate-id resolution.
    expect(mocks.listingFindMany).toHaveBeenCalledTimes(1);
    const where = whereOf(0);
    expect(where.availableTo).toEqual({ gte: new Date("2026-07-10") });
    expect(where.id).toBeUndefined();
  });
});
