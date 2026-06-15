// GET /api/discover/services + /api/discover/experiences (DOK-145).
// Pins env-gating (unconfigured partners are excluded), the JSON shapes the
// clients consume, and that every click-through URL routes via
// /api/affiliate/{partner} so the click is logged before the 302.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addOnFindMany: vi.fn(),
  listingGroupBy: vi.fn(),
  getCachedCityMediaMap: vi.fn(),
  checkRateLimitDurable: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    addOn: { findMany: mocks.addOnFindMany },
    listing: { groupBy: mocks.listingGroupBy },
  },
}));
vi.mock("@/lib/city-media", () => ({
  getCachedCityMediaMap: mocks.getCachedCityMediaMap,
  cityMediaKey: (city: string, country: string) => `${city} ${country}`,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  checkRateLimitDurable: mocks.checkRateLimitDurable,
}));

import { GET as getServices } from "@/app/api/discover/services/route";
import { GET as getExperiences } from "@/app/api/discover/experiences/route";

const ALL_AFF_ENVS = [
  "AFF_SKYSCANNER_ID",
  "AFF_AIRALO_ID",
  "AFF_GETYOURGUIDE_ID",
  "AFF_BATTLEFACE_ID",
] as const;

const PHOTO = {
  url: "https://images.test/lisbon.jpg",
  width: 1600,
  height: 900,
  alt: "Lisbon rooftops",
  provider: "pexels",
};

function req(path: string) {
  return new Request(`http://test${path}`, { headers: { "x-forwarded-for": "203.0.113.7" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ALL_AFF_ENVS) vi.stubEnv(k, "");
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true, remaining: 59, resetAt: 0 });
  mocks.addOnFindMany.mockResolvedValue([]);
  mocks.listingGroupBy.mockResolvedValue([]);
  mocks.getCachedCityMediaMap.mockResolvedValue(new Map());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/discover/services", () => {
  it("returns one entry per configured partner, none for unconfigured ones", async () => {
    vi.stubEnv("AFF_GETYOURGUIDE_ID", "gyg-123");
    vi.stubEnv("AFF_AIRALO_ID", "air-456");
    // skyscanner & battleface stay unset → must be excluded

    const res = await getServices(req("/api/discover/services"));
    expect(res.status).toBe(200);
    const { items } = await res.json();

    expect(items.map((i: { slug: string }) => i.slug).sort()).toEqual(["airalo", "getyourguide"]);
    const gyg = items.find((i: { slug: string }) => i.slug === "getyourguide");
    expect(gyg).toEqual({
      slug: "getyourguide",
      name: "GetYourGuide",
      category: "experiences",
      tagline: expect.any(String),
      url: "/api/affiliate/getyourguide?utm_campaign=discover_services",
      iconHint: "ticket",
      priceCents: null,
      currency: null,
    });
    const airalo = items.find((i: { slug: string }) => i.slug === "airalo");
    expect(airalo.category).toBe("esim");
    // Affiliate entries NEVER carry an invented price.
    expect(airalo.priceCents).toBeNull();
  });

  it("returns an empty catalogue when no partner is configured and no add-on is active", async () => {
    const res = await getServices(req("/api/discover/services"));
    expect(await res.json()).toEqual({ items: [] });
  });

  it("appends active concierge add-ons with their real DB price", async () => {
    vi.stubEnv("AFF_SKYSCANNER_ID", "sky-1");
    mocks.addOnFindMany.mockResolvedValue([
      {
        slug: "keynest-lockbox",
        name: "KeyNest key exchange",
        description: "Drop your keys at a KeyNest point near your home.",
        priceCents: 1490,
        currency: "EUR",
        type: "flat_fee",
        provider: "keynest",
        category: "lockbox",
        isActive: true,
      },
    ]);

    const res = await getServices(req("/api/discover/services"));
    const { items } = await res.json();

    // Only active add-ons are ever queried.
    expect(mocks.addOnFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
    expect(items.map((i: { slug: string }) => i.slug)).toEqual(["skyscanner", "keynest-lockbox"]);
    const addOn = items.find((i: { slug: string }) => i.slug === "keynest-lockbox");
    expect(addOn).toEqual({
      slug: "keynest-lockbox",
      name: "KeyNest key exchange",
      category: "concierge",
      tagline: "Drop your keys at a KeyNest point near your home.",
      url: null, // concierge checkout, not an affiliate redirect
      iconHint: "key",
      priceCents: 1490,
      currency: "EUR",
    });
  });

  it("429s when the per-IP rate limit trips", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false, remaining: 0, resetAt: 0 });
    const res = await getServices(req("/api/discover/services"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.addOnFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/discover/experiences", () => {
  it("returns an empty list when AFF_GETYOURGUIDE_ID is not configured", async () => {
    const res = await getExperiences(req("/api/discover/experiences?city=Lisbon"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
    expect(mocks.listingGroupBy).not.toHaveBeenCalled();
  });

  it("with ?city= returns themed cards whose URLs click through the affiliate redirector", async () => {
    vi.stubEnv("AFF_GETYOURGUIDE_ID", "gyg-123");
    mocks.listingGroupBy.mockResolvedValue([
      { city: "Lisbon", country: "Portugal", _count: { _all: 4 } },
    ]);
    mocks.getCachedCityMediaMap.mockResolvedValue(new Map([["Lisbon Portugal", [PHOTO]]]));

    const res = await getExperiences(req("/api/discover/experiences?city=lisbon"));
    const { items } = await res.json();

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      // Case-insensitive match resolves to the canonical listing city.
      expect(item.city).toBe("Lisbon");
      expect(item.country).toBe("Portugal");
      expect(item.partner).toBe("getyourguide");
      expect(item.photo).toEqual(PHOTO);
      // Every click goes through the logging redirector with the city query.
      const url = new URL(item.url, "http://test");
      expect(url.pathname).toBe("/api/affiliate/getyourguide");
      expect(url.searchParams.get("city")).toBe("Lisbon");
      expect(url.searchParams.get("country")).toBe("Portugal");
      expect(url.searchParams.get("q")).toContain("Lisbon");
      expect(url.searchParams.get("utm_campaign")).toBe("discover_experiences");
      // No invented prices anywhere in the card.
      expect(item).not.toHaveProperty("price");
      expect(item).not.toHaveProperty("priceCents");
    }
  });

  it("returns photo null for a city without cached media (client falls back to its illustration)", async () => {
    vi.stubEnv("AFF_GETYOURGUIDE_ID", "gyg-123");
    mocks.listingGroupBy.mockResolvedValue([]);

    const res = await getExperiences(req("/api/discover/experiences?city=Reykjavik"));
    const { items } = await res.json();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].city).toBe("Reykjavik");
    expect(items[0].photo).toBeNull();
  });

  it("without ?city= serves one card per top city by active listings", async () => {
    vi.stubEnv("AFF_GETYOURGUIDE_ID", "gyg-123");
    mocks.listingGroupBy.mockResolvedValue([
      { city: "Milan", country: "Italy", _count: { _all: 9 } },
      { city: "Lisbon", country: "Portugal", _count: { _all: 4 } },
    ]);
    mocks.getCachedCityMediaMap.mockResolvedValue(new Map([["Milan Italy", [PHOTO]]]));

    const res = await getExperiences(req("/api/discover/experiences"));
    const { items } = await res.json();

    // Same active-only groupBy the admin metrics use.
    expect(mocks.listingGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["city", "country"], where: { isActive: true, ineligibleReason: null } })
    );
    expect(items.map((i: { city: string }) => i.city)).toEqual(["Milan", "Lisbon"]);
    expect(items[0].photo).toEqual(PHOTO);
    expect(items[1].photo).toBeNull();
    for (const item of items) {
      expect(new URL(item.url, "http://test").pathname).toBe("/api/affiliate/getyourguide");
    }
  });

  it("429s when the per-IP rate limit trips", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false, remaining: 0, resetAt: 0 });
    const res = await getExperiences(req("/api/discover/experiences"));
    expect(res.status).toBe(429);
    expect(mocks.listingGroupBy).not.toHaveBeenCalled();
  });
});
