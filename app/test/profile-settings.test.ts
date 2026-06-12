// User settings (DOK-147): lib/settings parsing + merge, GET/PATCH
// /api/profile/settings, PATCH /api/profile, and the searchEngineIndexing
// effect on the sitemap.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, parseSettings, serialiseSettings } from "@/lib/settings";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  listingFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    listing: { findMany: mocks.listingFindMany },
  },
  parseJSON: (s: string | null, fallback: unknown) => {
    try {
      return s ? JSON.parse(s) : fallback;
    } catch {
      return fallback;
    }
  },
  stringifyJSON: (v: unknown) => JSON.stringify(v),
}));

import { GET as getSettings, PATCH as patchSettings } from "@/app/api/profile/settings/route";
import { PATCH as patchProfile } from "@/app/api/profile/route";
import sitemap from "@/app/sitemap";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.userFindUnique.mockResolvedValue({ settings: null });
  mocks.userUpdate.mockResolvedValue({});
  mocks.listingFindMany.mockResolvedValue([]);
});

describe("lib/settings", () => {
  it("null/garbage parses to defaults", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"searchEngineIndexing":"yes"}')).toEqual(DEFAULT_SETTINGS);
  });

  it("merge only touches provided boolean keys", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { showHomeCity: false });
    expect(merged).toEqual({ ...DEFAULT_SETTINGS, showHomeCity: false });
    // round-trips through serialise/parse
    expect(parseSettings(serialiseSettings(merged))).toEqual(merged);
  });
});

describe("GET/PATCH /api/profile/settings", () => {
  function patch(body: unknown) {
    return patchSettings(
      new Request("https://swapl.test/api/profile/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    );
  }

  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await getSettings(new Request("https://swapl.test/api/profile/settings"))).status).toBe(401);
    expect((await patch({ showHomeCity: false })).status).toBe(401);
  });

  it("GET returns defaults when the user never saved settings", async () => {
    const json = await (await getSettings(new Request("https://swapl.test/api/profile/settings"))).json();
    expect(json.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("PATCH merges over current settings and persists", async () => {
    mocks.userFindUnique.mockResolvedValue({
      settings: JSON.stringify({ ...DEFAULT_SETTINGS, emailNotifications: false }),
    });
    const res = await patch({ searchEngineIndexing: false });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings).toEqual({
      ...DEFAULT_SETTINGS,
      emailNotifications: false,
      searchEngineIndexing: false,
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { settings: JSON.stringify(json.settings) },
    });
  });

  it("PATCH 400 on non-boolean values", async () => {
    expect((await patch({ showHomeCity: "no" })).status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/profile", () => {
  function patch(body: unknown) {
    return patchProfile(
      new Request("https://swapl.test/api/profile", { method: "PATCH", body: JSON.stringify(body) })
    );
  }

  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await patch({ work: "Chef" })).status).toBe(401);
  });

  it("updates only the provided fields", async () => {
    mocks.userUpdate.mockResolvedValue({
      work: "Chef",
      languages: '["it"]',
      homeCity: null,
      homeCountry: null,
    });
    const res = await patch({ work: "Chef", languages: ["it"] });
    expect(res.status).toBe(200);
    expect(mocks.userUpdate.mock.calls[0][0].data).toEqual({
      work: "Chef",
      languages: '["it"]',
    });
    const json = await res.json();
    expect(json.profile).toEqual({ work: "Chef", languages: ["it"], homeCity: null, homeCountry: null });
  });

  it("400 on invalid shapes", async () => {
    expect((await patch({ languages: "italian" })).status).toBe(400);
    expect((await patch({ work: "x".repeat(121) })).status).toBe(400);
  });
});

describe("sitemap searchEngineIndexing effect", () => {
  it("drops listings of users who opted out of indexing", async () => {
    mocks.listingFindMany.mockResolvedValue([
      { id: "l-indexed", updatedAt: new Date(), user: { settings: null } },
      {
        id: "l-hidden",
        updatedAt: new Date(),
        user: { settings: JSON.stringify({ searchEngineIndexing: false }) },
      },
    ]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/listings/l-indexed"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/listings/l-hidden"))).toBe(false);
  });
});
