// GET /api/me/story (DOK-158) — personal story aggregation: trips vs hostings
// from COMPLETED swap agreements + completed Keys stays, distinct city/country
// counts, date-desc ordering, only-completed filtering, the empty-history case,
// and the referral code/url exposed for sharing.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  agreementFindMany: vi.fn(),
  keysStayFindMany: vi.fn(),
  ensureReferralCode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSession }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: { findMany: mocks.agreementFindMany },
    keysStay: { findMany: mocks.keysStayFindMany },
  },
}));
vi.mock("@/lib/growth/referrals", () => ({
  ensureReferralCode: mocks.ensureReferralCode,
  referralShareUrl: (code: string) => `https://swapl.test/?ref=${code}`,
}));

import { GET } from "@/app/api/me/story/route";

function get() {
  return GET(new Request("https://swapl.test/api/me/story"));
}

// u-1 owns listing1 in Milano. Two completed agreements + one completed Keys
// stay (as guest) + one completed Keys stay (as host).
const agreement = (
  dateFrom: string,
  dateTo: string,
  other: { userId: string; city: string; country: string; title: string; name: string },
) => ({
  dateFrom: new Date(dateFrom),
  dateTo: new Date(dateTo),
  listing1: { userId: "u-1", title: "Milano loft", city: "Milano", country: "Italy", user: { name: "Ana" } },
  listing2: {
    userId: other.userId,
    title: other.title,
    city: other.city,
    country: other.country,
    user: { name: other.name },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: "u-1", email: "ana@swapl.test", name: "Ana" });
  mocks.agreementFindMany.mockResolvedValue([]);
  mocks.keysStayFindMany.mockResolvedValue([]);
  mocks.ensureReferralCode.mockResolvedValue("ABCD234");
});

describe("GET /api/me/story", () => {
  it("401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("empty history → empty timeline + zeroed counts (still returns referral)", async () => {
    const json = await (await get()).json();
    expect(json.timeline).toEqual([]);
    expect(json.counts).toEqual({ trips: 0, hostings: 0, cities: 0, countries: 0 });
    expect(json.share).toEqual({ referralCode: "ABCD234", referralUrl: "https://swapl.test/?ref=ABCD234" });
  });

  it("queries ONLY completed swaps and Keys stays for the caller", async () => {
    await get();
    expect(mocks.agreementFindMany.mock.calls[0][0].where.status).toBe("COMPLETED");
    expect(mocks.keysStayFindMany.mock.calls[0][0].where.status).toBe("completed");
    // scoped to the session user as owner / guest|host
    expect(mocks.agreementFindMany.mock.calls[0][0].where.OR).toEqual([
      { listing1: { userId: "u-1" } },
      { listing2: { userId: "u-1" } },
    ]);
    expect(mocks.keysStayFindMany.mock.calls[0][0].where.OR).toEqual([
      { guestId: "u-1" },
      { hostId: "u-1" },
    ]);
  });

  it("one completed agreement yields a trip AND a hosting", async () => {
    mocks.agreementFindMany.mockResolvedValue([
      agreement("2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", {
        userId: "u-2",
        city: "Lisbon",
        country: "Portugal",
        title: "Alfama studio",
        name: "Ben",
      }),
    ]);
    const json = await (await get()).json();

    const trip = json.timeline.find((e: { kind: string }) => e.kind === "trip");
    const hosting = json.timeline.find((e: { kind: string }) => e.kind === "hosting");
    // Trip = the OTHER party's city; hosting = the caller's own city.
    expect(trip).toMatchObject({
      kind: "trip",
      city: "Lisbon",
      country: "Portugal",
      counterpartName: "Ben",
      listingTitle: "Alfama studio",
      year: 2026,
    });
    expect(hosting).toMatchObject({
      kind: "hosting",
      city: "Milano",
      country: "Italy",
      counterpartName: "Ben",
      listingTitle: "Milano loft",
      year: 2026,
    });
    expect(json.counts).toEqual({ trips: 1, hostings: 1, cities: 2, countries: 2 });
  });

  it("maps Keys stays: guest=trip, host=hosting", async () => {
    mocks.keysStayFindMany.mockResolvedValue([
      {
        dateFrom: new Date("2025-06-01T00:00:00Z"),
        dateTo: new Date("2025-06-05T00:00:00Z"),
        guestId: "u-1",
        hostId: "u-9",
        guest: { name: "Ana" },
        host: { name: "Cleo" },
        listing: { title: "Berlin flat", city: "Berlin", country: "Germany" },
      },
      {
        dateFrom: new Date("2025-07-01T00:00:00Z"),
        dateTo: new Date("2025-07-04T00:00:00Z"),
        guestId: "u-7",
        hostId: "u-1",
        guest: { name: "Dan" },
        host: { name: "Ana" },
        listing: { title: "Milano loft", city: "Milano", country: "Italy" },
      },
    ]);
    const json = await (await get()).json();
    const guestTrip = json.timeline.find((e: { city: string }) => e.city === "Berlin");
    const hostStay = json.timeline.find((e: { city: string }) => e.city === "Milano");
    expect(guestTrip).toMatchObject({ kind: "trip", counterpartName: "Cleo", listingTitle: "Berlin flat" });
    expect(hostStay).toMatchObject({ kind: "hosting", counterpartName: "Dan", listingTitle: "Milano loft" });
    expect(json.counts).toEqual({ trips: 1, hostings: 1, cities: 2, countries: 2 });
  });

  it("orders the timeline by end date descending and counts distinct cities/countries", async () => {
    mocks.agreementFindMany.mockResolvedValue([
      // older
      agreement("2025-08-01T00:00:00Z", "2025-08-10T00:00:00Z", {
        userId: "u-3",
        city: "Lisbon",
        country: "Portugal",
        title: "Alfama studio",
        name: "Ben",
      }),
      // newer
      agreement("2026-04-01T00:00:00Z", "2026-04-08T00:00:00Z", {
        userId: "u-4",
        city: "Lisbon",
        country: "Portugal",
        title: "Graça flat",
        name: "Cara",
      }),
    ]);
    const json = await (await get()).json();
    // 2 agreements → 4 events; newest dateTo first.
    expect(json.timeline).toHaveLength(4);
    expect(json.timeline[0].dateTo).toBe("2026-04-08T00:00:00.000Z");
    expect(json.timeline[json.timeline.length - 1].dateTo).toBe("2025-08-10T00:00:00.000Z");
    // Distinct cities: Lisbon|Portugal and Milano|Italy → 2; countries Portugal, Italy → 2.
    expect(json.counts).toEqual({ trips: 2, hostings: 2, cities: 2, countries: 2 });
  });
});
