// Saved travel windows + AI window proposals + tier limit (DOK-161).
//
// Hermetic (mocked prisma + availability + travel profile). Pins:
// - tier cap on create: Free=3 → 402 { error, upgradeTo, currentPlan }; admin bypass;
// - proposals only surface real homes that are AVAILABLE for the EXACT window
//   dates (per-candidate availability), excluding the user's own listing, and
//   respect the travel profile (destination + trait-city boosts re-rank);
// - each proposal carries direct-swap + Stay-with-Keys mode flags;
// - the digest cron is throttled + idempotent (stamps lastNotifiedAt, only
//   notifies on homes that became listable since the last run).

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // session + cron auth
  getSessionFromRequest: vi.fn(),
  isAuthorizedCron: vi.fn(() => true),
  // prisma
  travelWindowFindMany: vi.fn(),
  travelWindowFindUnique: vi.fn(),
  travelWindowCount: vi.fn(),
  travelWindowCreate: vi.fn(),
  travelWindowDelete: vi.fn(),
  travelWindowUpdate: vi.fn(),
  listingFindFirst: vi.fn(),
  listingFindMany: vi.fn(),
  favoriteFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  orgMemberFindFirst: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  // availability + profile
  bookedRangesFor: vi.fn(),
  readTravelProfile: vi.fn(),
  buildTravelProfile: vi.fn(),
  // notifiers
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/auth/cron", () => ({ isAuthorizedCron: mocks.isAuthorizedCron }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  prisma: {
    travelWindow: {
      findMany: mocks.travelWindowFindMany,
      findUnique: mocks.travelWindowFindUnique,
      count: mocks.travelWindowCount,
      create: mocks.travelWindowCreate,
      delete: mocks.travelWindowDelete,
      update: mocks.travelWindowUpdate,
    },
    listing: { findFirst: mocks.listingFindFirst, findMany: mocks.listingFindMany },
    favorite: { findMany: mocks.favoriteFindMany },
    user: { findUnique: mocks.userFindUnique },
    organizationMember: { findFirst: mocks.orgMemberFindFirst },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
}));
// Keep the REAL isRangeAvailable (pure predicate) so availability is genuinely
// exercised; only the DB-backed bookedRangesFor is mocked.
vi.mock("@/lib/listing/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/listing/availability")>()),
  bookedRangesFor: mocks.bookedRangesFor,
}));
vi.mock("@/lib/ai/travel-profile", () => ({
  readTravelProfile: mocks.readTravelProfile,
  buildTravelProfile: mocks.buildTravelProfile,
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { windowProposals: (to: string, m: string, c: number, city: string) => ({ to, m, c, city }) },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { windowProposals: (m: string, c: number, city: string) => ({ m, c, city }) },
}));

import { GET as listGET, POST as createPOST } from "@/app/api/travel-windows/route";
import { GET as proposalsGET } from "@/app/api/travel-windows/[id]/proposals/route";
import { GET as cronGET } from "@/app/api/cron/window-proposals/route";

const USER = { userId: "u1", email: "u1@swapl.test", name: "U" };

function makeListing(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "l-other",
    userId: "u2",
    title: "Sunny flat",
    city: "Lisbon",
    country: "Portugal",
    neighbourhood: "Alfama",
    sizeSqm: 70,
    sleeps: 4,
    petsAllowed: false,
    wfhSetup: true,
    stepFreeAccess: false,
    availableFrom: new Date("2026-08-01"),
    availableTo: new Date("2026-09-30"),
    minStayDays: 3,
    maxStayDays: 30,
    nightlyKeys: null,
    photos: JSON.stringify(["p.jpg"]),
    createdAt: new Date("2026-06-01"),
    ...over,
  };
}

const MINE = makeListing({ id: "l-mine", userId: "u1", city: "Berlin", country: "Germany" });

function req(url = "https://swapl.test/api/travel-windows") {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(USER);
  mocks.isAuthorizedCron.mockReturnValue(true);
  mocks.travelWindowCount.mockResolvedValue(0);
  mocks.travelWindowCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "tw-new",
    ...data,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    createdAt: new Date("2026-06-15"),
  }));
  mocks.travelWindowUpdate.mockResolvedValue({});
  mocks.listingFindFirst.mockResolvedValue(MINE);
  mocks.listingFindMany.mockResolvedValue([]);
  mocks.favoriteFindMany.mockResolvedValue([]);
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.orgMemberFindFirst.mockResolvedValue(null);
  mocks.subscriptionFindUnique.mockResolvedValue(null);
  mocks.bookedRangesFor.mockResolvedValue([]);
  mocks.readTravelProfile.mockResolvedValue(null);
  mocks.buildTravelProfile.mockResolvedValue(null);
});

describe("POST /api/travel-windows — tier limit", () => {
  const body = { dateFrom: "2026-08-10", dateTo: "2026-08-20" };
  const post = () =>
    createPOST(new Request("https://swapl.test/api/travel-windows", { method: "POST", body: JSON.stringify(body) }));

  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("creates under the Free cap (3)", async () => {
    mocks.travelWindowCount.mockResolvedValue(2); // free user, 2 existing < 3
    const res = await post();
    expect(res.status).toBe(201);
    expect(mocks.travelWindowCreate).toHaveBeenCalledOnce();
  });

  it("402 with { error, upgradeTo, currentPlan } at the Free cap (3)", async () => {
    mocks.travelWindowCount.mockResolvedValue(3); // at cap
    const res = await post();
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.currentPlan).toBe("free");
    expect(json.upgradeTo).toBe("plus");
    expect(typeof json.error).toBe("string");
    expect(mocks.travelWindowCreate).not.toHaveBeenCalled();
  });

  it("admin bypasses the cap entirely", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "swapl_admin" });
    mocks.travelWindowCount.mockResolvedValue(99);
    const res = await post();
    expect(res.status).toBe(201);
    // unlimited tier never even counts
    expect(mocks.travelWindowCount).not.toHaveBeenCalled();
  });

  it("Plus cap is 10", async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({ status: "active", planId: "plus" });
    mocks.travelWindowCount.mockResolvedValue(10);
    const res = await post();
    expect(res.status).toBe(402);
    expect((await res.json()).currentPlan).toBe("plus");
  });

  it("400 when dateTo is not after dateFrom", async () => {
    const res = await createPOST(
      new Request("https://swapl.test/api/travel-windows", {
        method: "POST",
        body: JSON.stringify({ dateFrom: "2026-08-20", dateTo: "2026-08-10" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/travel-windows", () => {
  it("returns the user's windows, soonest first, with parsed destinations", async () => {
    mocks.travelWindowFindMany.mockResolvedValue([
      {
        id: "tw1",
        dateFrom: new Date("2026-08-10"),
        dateTo: new Date("2026-08-20"),
        flexible: true,
        destinations: JSON.stringify(["Lisbon"]),
        notes: null,
        createdAt: new Date("2026-06-15"),
      },
    ]);
    const res = await listGET(req());
    const json = await res.json();
    expect(json.items[0].destinations).toEqual(["Lisbon"]);
    expect(json.items[0].dateFrom).toBe("2026-08-10");
  });
});

describe("GET /api/travel-windows/{id}/proposals", () => {
  const window = {
    id: "tw1",
    userId: "u1",
    dateFrom: new Date("2026-08-10"),
    dateTo: new Date("2026-08-20"),
    flexible: false,
    destinations: null,
  };
  const call = () => proposalsGET(req(), { params: Promise.resolve({ id: "tw1" }) } as never);

  beforeEach(() => mocks.travelWindowFindUnique.mockResolvedValue(window));

  it("404 for someone else's window", async () => {
    mocks.travelWindowFindUnique.mockResolvedValue({ ...window, userId: "someone-else" });
    expect((await call()).status).toBe(404);
  });

  it("409 when the user has no active listing", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(409);
  });

  it("only surfaces homes available for the EXACT window dates", async () => {
    const free = makeListing({ id: "free-home", city: "Lisbon" });
    // Booked solid across the window — must be filtered out by availability.
    const booked = makeListing({ id: "booked-home", city: "Porto" });
    mocks.listingFindMany.mockResolvedValue([free, booked]);
    mocks.bookedRangesFor.mockImplementation(async (id: string) =>
      id === "booked-home"
        ? [{ dateFrom: new Date("2026-08-05"), dateTo: new Date("2026-08-25"), source: "agreement" }]
        : [],
    );
    const json = await (await call()).json();
    const ids = json.proposals.map((p: { listingId: string }) => p.listingId);
    expect(ids).toContain("free-home");
    expect(ids).not.toContain("booked-home");
  });

  it("flags Stay-with-Keys only when the home has a nightly Keys value", async () => {
    mocks.listingFindMany.mockResolvedValue([
      makeListing({ id: "keys-home", nightlyKeys: 40 }),
      makeListing({ id: "swap-only", nightlyKeys: null }),
    ]);
    const json = await (await call()).json();
    const byId = Object.fromEntries(json.proposals.map((p: { listingId: string }) => [p.listingId, p]));
    expect(byId["keys-home"].modes).toEqual({ directSwap: true, keysStay: true });
    expect(byId["swap-only"].modes).toEqual({ directSwap: true, keysStay: false });
  });

  it("re-ranks toward profile trait-cities", async () => {
    mocks.readTravelProfile.mockResolvedValue({
      summary: "s",
      traits: { themes: [], cities: ["Lisbon"], vibe: "", constraints: [] },
    });
    mocks.listingFindMany.mockResolvedValue([
      makeListing({ id: "plain", city: "Madrid" }),
      makeListing({ id: "trait", city: "Lisbon" }),
    ]);
    const json = await (await call()).json();
    // The trait-city home should outrank the otherwise-identical one.
    expect(json.proposals[0].listingId).toBe("trait");
  });
});

describe("GET /api/cron/window-proposals — idempotency", () => {
  const NOW = new Date("2026-06-15T12:00:00Z");
  const window = {
    id: "tw1",
    userId: "u1",
    dateFrom: new Date("2026-08-10"),
    dateTo: new Date("2026-08-20"),
    flexible: false,
    destinations: null,
    lastNotifiedAt: null,
    user: { id: "u1", email: "u1@swapl.test" },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const run = () => cronGET(new Request("https://swapl.test/api/cron/window-proposals"));

  it("403 when the caller is not an authorized cron", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    expect((await run()).status).toBe(403);
  });

  it("notifies once for a freshly-listed compatible home, then stamps", async () => {
    mocks.travelWindowFindMany.mockResolvedValue([window]);
    // Compatible, available home created AFTER the (24h) baseline → fresh.
    const fresh = makeListing({ id: "fresh-home", createdAt: NOW });
    mocks.listingFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      // 1st call: candidate pool. 2nd call: "created since" filter.
      if ((args.where as { createdAt?: unknown }).createdAt) return [{ id: "fresh-home" }];
      return [fresh];
    });
    const res = await run();
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendPush).toHaveBeenCalledOnce();
    expect(mocks.travelWindowUpdate).toHaveBeenCalledWith({
      where: { id: "tw1" },
      data: { lastNotifiedAt: NOW },
    });
  });

  it("does not notify when no compatible home is newer than lastNotifiedAt (rerun is a no-op)", async () => {
    mocks.travelWindowFindMany.mockResolvedValue([
      { ...window, lastNotifiedAt: new Date("2026-06-14T12:00:00Z") },
    ]);
    const old = makeListing({ id: "old-home", createdAt: new Date("2026-05-01") });
    mocks.listingFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ((args.where as { createdAt?: unknown }).createdAt) return []; // nothing fresh
      return [old];
    });
    const res = await run();
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    // still stamps so it stays throttled
    expect(mocks.travelWindowUpdate).toHaveBeenCalledWith({
      where: { id: "tw1" },
      data: { lastNotifiedAt: NOW },
    });
  });
});
