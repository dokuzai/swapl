// GET /api/profiles/{id} — rich fields, stats from real aggregates, visited
// cities derived from COMPLETED agreements (the OTHER listing's city), latest
// reviews (published only — DOK-149), the showHomeCity privacy gate, and the
// per-IP durable rate limit.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  listingFindMany: vi.fn(),
  agreementFindMany: vi.fn(),
  reviewAggregate: vi.fn(),
  reviewFindMany: vi.fn(),
  checkRateLimitDurable: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitDurable: mocks.checkRateLimitDurable,
  clientIpFromRequest: (req: Request) => req.headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    listing: { findMany: mocks.listingFindMany },
    swapAgreement: { findMany: mocks.agreementFindMany },
    swapReview: { aggregate: mocks.reviewAggregate, findMany: mocks.reviewFindMany },
  },
  parseJSON: (s: string | null, fallback: unknown) => {
    try {
      return s ? JSON.parse(s) : fallback;
    } catch {
      return fallback;
    }
  },
}));
vi.mock("@/lib/listing-utils", () => ({ toDTO: vi.fn((l: { id: string }) => ({ id: l.id })) }));

import { GET } from "@/app/api/profiles/[id]/route";

const baseUser = {
  id: "u-1",
  name: "Ana",
  avatar: null,
  bio: "hi",
  bioVibe: null,
  verified: true,
  interests: '["coffee"]',
  work: "Architect",
  languages: '["it","en"]',
  homeCity: "Milano",
  homeCountry: "Italy",
  settings: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  suspendedAt: null,
};

function get(id = "u-1") {
  return GET(new Request(`https://swapl.test/api/profiles/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(baseUser);
  mocks.listingFindMany.mockResolvedValue([]);
  mocks.agreementFindMany.mockResolvedValue([]);
  mocks.reviewAggregate.mockResolvedValue({ _count: 0, _avg: { rating: null } });
  mocks.reviewFindMany.mockResolvedValue([]);
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000 });
});

describe("GET /api/profiles/{id}", () => {
  it("404 on suspended users", async () => {
    mocks.userFindUnique.mockResolvedValue({ ...baseUser, suspendedAt: new Date() });
    expect((await get()).status).toBe(404);
  });

  it("returns rich fields and home city by default (showHomeCity defaults true)", async () => {
    const json = await (await get()).json();
    expect(json.user).toMatchObject({
      work: "Architect",
      languages: ["it", "en"],
      homeCity: "Milano",
      homeCountry: "Italy",
    });
  });

  it("omits homeCity/homeCountry when showHomeCity=false", async () => {
    mocks.userFindUnique.mockResolvedValue({
      ...baseUser,
      settings: JSON.stringify({ showHomeCity: false }),
    });
    const json = await (await get()).json();
    expect(json.user.homeCity).toBeNull();
    expect(json.user.homeCountry).toBeNull();
    // other fields untouched
    expect(json.user.work).toBe("Architect");
  });

  it("computes stats from completed agreements + review aggregates", async () => {
    mocks.agreementFindMany.mockResolvedValue([
      {
        dateTo: new Date("2026-03-10T00:00:00Z"),
        listing1: { userId: "u-1", city: "Milano", country: "Italy" },
        listing2: { userId: "u-2", city: "Lisbon", country: "Portugal" },
      },
      {
        dateTo: new Date("2025-08-01T00:00:00Z"),
        listing1: { userId: "u-3", city: "Berlin", country: "Germany" },
        listing2: { userId: "u-1", city: "Milano", country: "Italy" },
      },
    ]);
    mocks.reviewAggregate.mockResolvedValue({ _count: 3, _avg: { rating: 4.6666666 } });

    const json = await (await get()).json();
    expect(json.stats).toEqual({
      swapsCompleted: 2,
      reviewsCount: 3,
      avgRating: 4.7,
      memberSince: "2025-01-01T00:00:00.000Z",
    });
    // only COMPLETED agreements are queried
    expect(mocks.agreementFindMany.mock.calls[0][0].where.status).toBe("COMPLETED");
  });

  it("visited lists the OTHER party's city, deduped per city/year", async () => {
    mocks.agreementFindMany.mockResolvedValue([
      {
        dateTo: new Date("2026-03-10T00:00:00Z"),
        listing1: { userId: "u-1", city: "Milano", country: "Italy" },
        listing2: { userId: "u-2", city: "Lisbon", country: "Portugal" },
      },
      {
        // repeat Lisbon same year — collapses
        dateTo: new Date("2026-05-01T00:00:00Z"),
        listing1: { userId: "u-1", city: "Milano", country: "Italy" },
        listing2: { userId: "u-4", city: "Lisbon", country: "Portugal" },
      },
      {
        // user owns listing2 here → visited city is listing1's
        dateTo: new Date("2025-08-01T00:00:00Z"),
        listing1: { userId: "u-3", city: "Berlin", country: "Germany" },
        listing2: { userId: "u-1", city: "Milano", country: "Italy" },
      },
    ]);

    const json = await (await get()).json();
    expect(json.visited).toEqual([
      { city: "Lisbon", country: "Portugal", year: 2026 },
      { city: "Berlin", country: "Germany", year: 2025 },
    ]);
  });

  it("returns the latest reviews with author info", async () => {
    mocks.reviewFindMany.mockResolvedValue([
      {
        id: "rev-1",
        rating: 5,
        text: "Wonderful host, immaculate flat.",
        createdAt: new Date("2026-04-01T00:00:00Z"),
        author: { id: "u-2", name: "Ben", avatar: null },
      },
    ]);
    const json = await (await get()).json();
    expect(json.reviews).toEqual([
      {
        id: "rev-1",
        author: { id: "u-2", name: "Ben", avatar: null },
        rating: 5,
        text: "Wonderful host, immaculate flat.",
        createdAt: "2026-04-01T00:00:00.000Z",
        listing: null,
      },
    ]);
    expect(mocks.reviewFindMany.mock.calls[0][0]).toMatchObject({
      where: { subjectId: "u-1" },
      take: 10,
    });
  });

  it("counts and returns ONLY published reviews (hidden are moderated away)", async () => {
    await get();
    expect(mocks.reviewAggregate.mock.calls[0][0].where).toEqual({
      subjectId: "u-1",
      status: "published",
    });
    expect(mocks.reviewFindMany.mock.calls[0][0].where).toEqual({
      subjectId: "u-1",
      status: "published",
    });
  });

  it("429s when the per-IP durable rate limit trips, before touching the DB", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const res = await get();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("RATE_LIMITED");
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("keys the rate limit on the client IP", async () => {
    const req = new Request("https://swapl.test/api/profiles/u-1", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    await GET(req, { params: Promise.resolve({ id: "u-1" }) });
    expect(mocks.checkRateLimitDurable).toHaveBeenCalledWith("profiles:203.0.113.9", 60, 60_000);
  });
});
