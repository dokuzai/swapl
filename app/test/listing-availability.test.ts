// Per-listing availability (DOK-159): the single helper that decides whether a
// listing is free for a date range, sourcing occupied ranges from ACTIVE swap
// agreements, pending/confirmed Keys stays, and host-blocked ranges. Plus the
// calendar endpoint and the owner-gated blocked-ranges routes. Prisma + session
// mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  listingFindUnique: vi.fn(),
  agreementFindMany: vi.fn(async () => [] as unknown[]),
  keysStayFindMany: vi.fn(async () => [] as unknown[]),
  blockedFindMany: vi.fn(async () => [] as unknown[]),
  blockedFindUnique: vi.fn(),
  blockedCreate: vi.fn(),
  blockedDelete: vi.fn(async () => ({})),
  occupancyCreate: vi.fn(async () => ({})),
  occupancyDeleteMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: mocks.listingFindUnique },
    swapAgreement: { findMany: mocks.agreementFindMany },
    keysStay: { findMany: mocks.keysStayFindMany },
    listingBlockedRange: {
      findMany: mocks.blockedFindMany,
      findUnique: mocks.blockedFindUnique,
      create: mocks.blockedCreate,
      delete: mocks.blockedDelete,
    },
    listingOccupancy: {
      create: mocks.occupancyCreate,
      deleteMany: mocks.occupancyDeleteMany,
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        swapAgreement: { findMany: mocks.agreementFindMany },
        keysStay: { findMany: mocks.keysStayFindMany },
        listingBlockedRange: {
          findMany: mocks.blockedFindMany,
          create: mocks.blockedCreate,
          delete: mocks.blockedDelete,
        },
        listingOccupancy: {
          create: mocks.occupancyCreate,
          deleteMany: mocks.occupancyDeleteMany,
        },
      }),
  },
}));

import { availabilityFor, isAvailable, isRangeAvailable, rangesOverlap, bookedRangesFor } from "@/lib/listing/availability";

const LISTING = {
  id: "L1",
  availableFrom: new Date("2026-07-01"),
  availableTo: new Date("2026-08-31"),
  minStayDays: 3,
  maxStayDays: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agreementFindMany.mockResolvedValue([]);
  mocks.keysStayFindMany.mockResolvedValue([]);
  mocks.blockedFindMany.mockResolvedValue([]);
  mocks.listingFindUnique.mockResolvedValue(LISTING);
});

describe("rangesOverlap", () => {
  it("treats ranges as half-open [from, to)", () => {
    const a = new Date("2026-07-10");
    const b = new Date("2026-07-17");
    const c = new Date("2026-07-17"); // touches b's end
    const d = new Date("2026-07-20");
    expect(rangesOverlap(a, b, c, d)).toBe(false); // checkout day frees up
    expect(rangesOverlap(a, b, new Date("2026-07-16"), d)).toBe(true);
  });
});

describe("isRangeAvailable (pure)", () => {
  it("accepts a range fully inside the window with no conflicts", () => {
    expect(isRangeAvailable(LISTING, new Date("2026-07-10"), new Date("2026-07-17"), [])).toBe(true);
  });
  it("rejects a range outside the published window", () => {
    expect(isRangeAvailable(LISTING, new Date("2026-09-10"), new Date("2026-09-15"), [])).toBe(false);
  });
  it("rejects below minStayDays", () => {
    expect(isRangeAvailable(LISTING, new Date("2026-07-10"), new Date("2026-07-12"), [])).toBe(false); // 2 nights
  });
  it("rejects above maxStayDays", () => {
    expect(isRangeAvailable(LISTING, new Date("2026-07-01"), new Date("2026-08-15"), [])).toBe(false); // 45 nights
  });
  it("rejects an inverted/empty range", () => {
    expect(isRangeAvailable(LISTING, new Date("2026-07-17"), new Date("2026-07-10"), [])).toBe(false);
  });
  it("rejects when an occupied range overlaps", () => {
    const occ = [{ dateFrom: new Date("2026-07-12"), dateTo: new Date("2026-07-20") }];
    expect(isRangeAvailable(LISTING, new Date("2026-07-10"), new Date("2026-07-17"), occ)).toBe(false);
  });
});

describe("bookedRangesFor (sources)", () => {
  it("merges agreements, keys stays, and host blocks with labels", async () => {
    mocks.agreementFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-05"), dateTo: new Date("2026-07-08") }]);
    mocks.keysStayFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-12"), dateTo: new Date("2026-07-15") }]);
    mocks.blockedFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-20"), dateTo: new Date("2026-07-22") }]);
    const ranges = await bookedRangesFor("L1");
    expect(ranges.map((r) => r.source).sort()).toEqual(["agreement", "blocked", "keys_stay"]);
  });

  it("queries only ACTIVE agreements and pending/confirmed stays", async () => {
    await bookedRangesFor("L1");
    expect(mocks.agreementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(mocks.keysStayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["pending", "confirmed"] } }) }),
    );
  });
});

describe("isAvailable (DB-backed)", () => {
  it("returns false for a missing listing", async () => {
    mocks.listingFindUnique.mockResolvedValue(null);
    expect(await isAvailable("nope", new Date("2026-07-10"), new Date("2026-07-17"))).toBe(false);
  });

  it("is false when a host block overlaps", async () => {
    mocks.blockedFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-14"), dateTo: new Date("2026-07-18") }]);
    expect(await isAvailable(LISTING, new Date("2026-07-10"), new Date("2026-07-17"))).toBe(false);
  });

  it("is true when nothing overlaps", async () => {
    expect(await isAvailable(LISTING, new Date("2026-07-10"), new Date("2026-07-17"))).toBe(true);
  });

  it("an active agreement on either listing side blocks", async () => {
    mocks.agreementFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-10"), dateTo: new Date("2026-07-13") }]);
    expect(await isAvailable(LISTING, new Date("2026-07-12"), new Date("2026-07-17"))).toBe(false);
  });
});

describe("availabilityFor (calendar payload)", () => {
  it("returns the window + sorted, labelled booked ranges as ISO strings", async () => {
    mocks.blockedFindMany.mockResolvedValue([{ dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-03") }]);
    mocks.keysStayFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-05"), dateTo: new Date("2026-07-08") }]);
    const res = await availabilityFor(LISTING);
    expect(res.listingId).toBe("L1");
    expect(res.availableFrom).toBe(LISTING.availableFrom.toISOString());
    expect(res.minStayDays).toBe(3);
    // Sorted ascending by dateFrom: keys stay (Jul 5) before block (Aug 1).
    expect(res.bookedRanges.map((r) => r.source)).toEqual(["keys_stay", "blocked"]);
    expect(res.bookedRanges[0].dateFrom).toBe(new Date("2026-07-05").toISOString());
  });
});

describe("GET /api/listings/{id}/calendar", () => {
  it("404s a missing or inactive listing", async () => {
    const { GET } = await import("@/app/api/listings/[id]/calendar/route");
    mocks.listingFindUnique.mockResolvedValue(null);
    const res = await GET(new Request("https://swapl.test/api/listings/L1/calendar"), {
      params: Promise.resolve({ id: "L1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the calendar payload for an active listing", async () => {
    const { GET } = await import("@/app/api/listings/[id]/calendar/route");
    mocks.listingFindUnique.mockResolvedValue({ ...LISTING, isActive: true });
    const res = await GET(new Request("https://swapl.test/api/listings/L1/calendar"), {
      params: Promise.resolve({ id: "L1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listingId).toBe("L1");
    expect(Array.isArray(body.bookedRanges)).toBe(true);
  });
});

describe("blocked-ranges routes (owner-gated)", () => {
  function postReq(body: unknown) {
    return new Request("https://swapl.test/api/listings/L1/blocked-ranges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const ctx = { params: Promise.resolve({ id: "L1" }) };

  it("401 without a session", async () => {
    const { POST } = await import("@/app/api/listings/[id]/blocked-ranges/route");
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = (await POST(postReq({ dateFrom: "2026-07-10", dateTo: "2026-07-15" }), ctx))!;
    expect(res.status).toBe(401);
  });

  it("403 when the caller is not the owner", async () => {
    const { POST } = await import("@/app/api/listings/[id]/blocked-ranges/route");
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "intruder" });
    mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "owner" });
    const res = (await POST(postReq({ dateFrom: "2026-07-10", dateTo: "2026-07-15" }), ctx))!;
    expect(res.status).toBe(403);
    expect(mocks.blockedCreate).not.toHaveBeenCalled();
  });

  it("owner can block a valid range", async () => {
    const { POST } = await import("@/app/api/listings/[id]/blocked-ranges/route");
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "owner" });
    mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "owner" });
    mocks.blockedCreate.mockResolvedValue({
      id: "blk1",
      dateFrom: new Date("2026-07-10"),
      dateTo: new Date("2026-07-15"),
      note: "reno",
      createdAt: new Date("2026-06-15"),
    });
    const res = (await POST(postReq({ dateFrom: "2026-07-10", dateTo: "2026-07-15", note: "reno" }), ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.range.id).toBe("blk1");
    expect(mocks.occupancyCreate).toHaveBeenCalledWith({
      data: {
        listingId: "L1",
        source: "blocked_range",
        sourceId: "blk1",
        dateFrom: new Date("2026-07-10"),
        dateTo: new Date("2026-07-15"),
      },
    });
  });

  it("rejects a block that overlaps an existing occupied range", async () => {
    const { POST } = await import("@/app/api/listings/[id]/blocked-ranges/route");
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "owner" });
    mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "owner" });
    mocks.keysStayFindMany.mockResolvedValue([{ dateFrom: new Date("2026-07-12"), dateTo: new Date("2026-07-18") }]);

    const res = (await POST(postReq({ dateFrom: "2026-07-10", dateTo: "2026-07-15" }), ctx))!;

    expect(res.status).toBe(400);
    expect(mocks.blockedCreate).not.toHaveBeenCalled();
    expect(mocks.occupancyCreate).not.toHaveBeenCalled();
  });

  it("rejects an inverted range", async () => {
    const { POST } = await import("@/app/api/listings/[id]/blocked-ranges/route");
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "owner" });
    mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "owner" });
    const res = (await POST(postReq({ dateFrom: "2026-07-15", dateTo: "2026-07-10" }), ctx))!;
    expect(res.status).toBe(400);
  });

  it("DELETE refuses a range belonging to another listing", async () => {
    const { DELETE } = await import("@/app/api/listings/[id]/blocked-ranges/route");
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "owner" });
    mocks.listingFindUnique.mockResolvedValue({ id: "L1", userId: "owner" });
    mocks.blockedFindUnique.mockResolvedValue({ id: "blk1", listingId: "OTHER" });
    const req = new Request("https://swapl.test/api/listings/L1/blocked-ranges", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rangeId: "blk1" }),
    });
    const res = (await DELETE(req, ctx))!;
    expect(res.status).toBe(404);
    expect(mocks.blockedDelete).not.toHaveBeenCalled();
  });
});
