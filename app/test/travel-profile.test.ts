// lib/ai/travel-profile + /api/assistant/profile (DOK-146).
//
// Pins the privacy-first contract: the profile is built ONLY from in-app
// signals, the deterministic (no AI key) synthesis is stable, the row is
// upserted so the user can read it verbatim, and DELETE erases it.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  listingFindFirst: vi.fn(),
  favoriteFindMany: vi.fn(),
  savedSearchFindMany: vi.fn(),
  swapMessageFindMany: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  profileDeleteMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    listing: { findFirst: mocks.listingFindFirst },
    favorite: { findMany: mocks.favoriteFindMany },
    savedSearch: { findMany: mocks.savedSearchFindMany },
    swapMessage: { findMany: mocks.swapMessageFindMany },
    travelProfile: {
      findUnique: mocks.profileFindUnique,
      upsert: mocks.profileUpsert,
      deleteMany: mocks.profileDeleteMany,
    },
  },
}));

import { buildTravelProfile, readTravelProfile } from "@/lib/ai/travel-profile";
import { GET as getProfile, DELETE as deleteProfile } from "@/app/api/assistant/profile/route";
import { POST as refreshProfile } from "@/app/api/assistant/profile/refresh/route";

const AI_ENVS = ["AI_API_KEY", "AI_PROVIDER", "KIMI_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

function fav(city: string, opts: Partial<{ tags: string[]; petsAllowed: boolean; wfhSetup: boolean; stepFreeAccess: boolean }> = {}) {
  return {
    listing: {
      city,
      country: "PT",
      tags: JSON.stringify(opts.tags ?? []),
      petsAllowed: opts.petsAllowed ?? false,
      wfhSetup: opts.wfhSetup ?? false,
      stepFreeAccess: opts.stepFreeAccess ?? false,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of AI_ENVS) vi.stubEnv(k, ""); // hermetic: deterministic path only
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.userFindUnique.mockResolvedValue({
    interests: JSON.stringify(["surfing", "street-food"]),
    bio: "Remote worker, loves the sea.",
    bioVibe: "slow mornings, long walks",
    aiProvider: null,
    aiModel: null,
    aiApiKey: null,
  });
  mocks.listingFindFirst.mockResolvedValue({ city: "Milan", petsAllowed: true, wfhSetup: true, stepFreeAccess: false });
  mocks.favoriteFindMany.mockResolvedValue([fav("Lisbon", { tags: ["sea view"] }), fav("Lisbon"), fav("Porto")]);
  mocks.savedSearchFindMany.mockResolvedValue([{ query: "city=Lisbon&tags=surf" }]);
  mocks.swapMessageFindMany.mockResolvedValue([{ body: "We'd love a quiet street near the beach." }]);
  mocks.profileUpsert.mockImplementation(({ create }) => Promise.resolve({ ...create, updatedAt: new Date("2026-06-12T10:00:00Z") }));
  mocks.profileFindUnique.mockResolvedValue(null);
  mocks.profileDeleteMany.mockResolvedValue({ count: 1 });
});

describe("buildTravelProfile (deterministic, no AI key)", () => {
  it("aggregates cities, themes and constraints from in-app signals only", async () => {
    const out = await buildTravelProfile("u-1");
    expect(out).not.toBeNull();
    // Lisbon appears in 2 favorites + 1 saved search → ranked first.
    expect(out!.traits.cities[0]).toBe("Lisbon");
    expect(out!.traits.cities).toContain("Porto");
    expect(out!.traits.themes).toContain("surfing");
    expect(out!.traits.themes).toContain("street-food");
    expect(out!.traits.themes).toContain("sea view");
    // Constraints come from the user's own listing flags.
    expect(out!.traits.constraints).toEqual(expect.arrayContaining(["pet-friendly", "wfh"]));
    expect(out!.traits.vibe).toBe("slow mornings, long walks");
    expect(out!.summary).toContain("Lisbon");
  });

  it("reports exactly the sources that contributed", async () => {
    const out = await buildTravelProfile("u-1");
    expect(out!.sourcesUsed).toEqual(["interests", "favorites", "saved_searches", "swap_messages"]);
  });

  it("omits empty sources and still writes a usable summary", async () => {
    mocks.userFindUnique.mockResolvedValue({ interests: "[]", bio: null, bioVibe: null, aiProvider: null, aiModel: null, aiApiKey: null });
    mocks.listingFindFirst.mockResolvedValue(null);
    mocks.favoriteFindMany.mockResolvedValue([]);
    mocks.savedSearchFindMany.mockResolvedValue([]);
    mocks.swapMessageFindMany.mockResolvedValue([]);
    const out = await buildTravelProfile("u-1");
    expect(out!.sourcesUsed).toEqual([]);
    expect(out!.traits).toEqual({ themes: [], cities: [], vibe: null, constraints: [] });
    expect(out!.summary.length).toBeGreaterThan(10);
  });

  it("upserts the TravelProfile row (visible + deletable by the user)", async () => {
    await buildTravelProfile("u-1");
    expect(mocks.profileUpsert).toHaveBeenCalledTimes(1);
    const arg = mocks.profileUpsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u-1" });
    expect(JSON.parse(arg.create.traits).cities[0]).toBe("Lisbon");
  });
});

describe("readTravelProfile", () => {
  it("returns the stored row parsed, or null when deleted/never built", async () => {
    expect(await readTravelProfile("u-1")).toBeNull();
    mocks.profileFindUnique.mockResolvedValue({
      summary: "s",
      traits: JSON.stringify({ themes: ["surf"], cities: ["Lisbon"], vibe: null, constraints: [] }),
      sourcesUsed: JSON.stringify(["favorites"]),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    });
    const out = await readTravelProfile("u-1");
    expect(out!.traits.cities).toEqual(["Lisbon"]);
    expect(out!.sourcesUsed).toEqual(["favorites"]);
  });
});

describe("/api/assistant/profile routes", () => {
  const req = (method = "GET") => new Request("https://swapl.test/api/assistant/profile", { method });

  it("GET builds the profile on first read", async () => {
    const res = await getProfile(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traits.cities[0]).toBe("Lisbon");
    expect(mocks.profileUpsert).toHaveBeenCalled();
  });

  it("GET returns the stored profile without rebuilding", async () => {
    mocks.profileFindUnique.mockResolvedValue({
      summary: "stored",
      traits: "{}",
      sourcesUsed: "[]",
      updatedAt: new Date(),
    });
    const res = await getProfile(req());
    expect((await res.json()).summary).toBe("stored");
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it("DELETE erases the profile", async () => {
    const res = await deleteProfile(req("DELETE"));
    expect(res.status).toBe(200);
    expect(mocks.profileDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });

  it("rejects anonymous callers", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await getProfile(req())).status).toBe(401);
    expect((await deleteProfile(req("DELETE"))).status).toBe(401);
    expect((await refreshProfile(req("POST"))).status).toBe(401);
  });

  it("POST /refresh rebuilds and is rate-limited 5/h", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await refreshProfile(req("POST"))).status).toBe(200);
    }
    expect((await refreshProfile(req("POST"))).status).toBe(429);
    expect(mocks.profileUpsert).toHaveBeenCalledTimes(5);
  });
});
