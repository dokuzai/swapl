import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Replace the lazy Prisma proxy with stubs (factory must be self-contained —
// vitest hoists vi.mock above the imports). parseJSON/stringifyJSON are
// re-implemented inline because lib/city-media imports them from @/lib/db too.
vi.mock("@/lib/db", () => ({
  prisma: {
    cityMedia: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  },
  parseJSON: <T,>(s: string | null | undefined, fallback: T): T => {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
  stringifyJSON: (v: unknown) => JSON.stringify(v),
}));

import { prisma } from "@/lib/db";
import {
  normalizePexels,
  normalizeUnsplash,
  normalizeWikimedia,
  resolveProvider,
} from "@/lib/city-media/providers";
import { getCityMedia, getCachedCityMedia, isFresh, CITY_MEDIA_TTL_MS } from "@/lib/city-media";
import type { CityPhoto } from "@/lib/city-media/types";

type Stub = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  cityMedia: { findUnique: Stub; findMany: Stub; upsert: Stub };
};

const photo = (over: Partial<CityPhoto> = {}): CityPhoto => ({
  url: "https://img.test/1.jpg",
  width: 1600,
  height: 1000,
  alt: "Istanbul skyline",
  provider: "pexels",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.cityMedia.findUnique.mockResolvedValue(null);
  db.cityMedia.findMany.mockResolvedValue([]);
  db.cityMedia.upsert.mockResolvedValue({});
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------- provider normalization ----------

describe("normalizePexels", () => {
  it("maps the Pexels search payload to the normalized shape", () => {
    const out = normalizePexels(
      {
        photos: [
          {
            width: 4000,
            height: 2500,
            url: "https://www.pexels.com/photo/123/",
            alt: "Galata tower at dusk",
            photographer: "Ayşe K",
            photographer_url: "https://www.pexels.com/@ayse",
            src: { large2x: "https://images.pexels.com/123-large2x.jpg" },
          },
        ],
      },
      "Istanbul"
    );
    expect(out).toEqual([
      {
        url: "https://images.pexels.com/123-large2x.jpg",
        width: 4000,
        height: 2500,
        alt: "Galata tower at dusk",
        photographer: "Ayşe K",
        photographerUrl: "https://www.pexels.com/@ayse",
        sourceUrl: "https://www.pexels.com/photo/123/",
        provider: "pexels",
      },
    ]);
  });

  it("falls back through src sizes, fills empty alts, drops url-less photos", () => {
    const out = normalizePexels(
      {
        photos: [
          { width: 1, height: 1, url: "p", alt: "", photographer: "", photographer_url: "", src: { large: "https://l.jpg" } },
          { width: 1, height: 1, url: "p2", alt: null, photographer: "X", photographer_url: "", src: {} },
        ],
      },
      "Istanbul"
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://l.jpg");
    expect(out[0].alt).toBe("Istanbul city view");
    expect(out[0].photographer).toBeUndefined();
  });

  it("returns [] for malformed payloads", () => {
    expect(normalizePexels(null, "X")).toEqual([]);
    expect(normalizePexels({ photos: "nope" }, "X")).toEqual([]);
  });
});

describe("normalizeUnsplash", () => {
  it("maps the Unsplash search payload to the normalized shape", () => {
    const out = normalizeUnsplash(
      {
        results: [
          {
            width: 3000,
            height: 2000,
            alt_description: "bosphorus bridge",
            urls: { regular: "https://images.unsplash.com/abc" },
            links: { html: "https://unsplash.com/photos/abc" },
            user: { name: "Mehmet", links: { html: "https://unsplash.com/@mehmet" } },
          },
        ],
      },
      "Istanbul"
    );
    expect(out[0]).toMatchObject({
      url: "https://images.unsplash.com/abc",
      alt: "bosphorus bridge",
      photographer: "Mehmet",
      photographerUrl: "https://unsplash.com/@mehmet",
      sourceUrl: "https://unsplash.com/photos/abc",
      provider: "unsplash",
    });
  });
});

describe("normalizeWikimedia", () => {
  const page = (title: string, info: Record<string, unknown> = {}) => ({
    title,
    imageinfo: [
      {
        thumburl: `https://upload.wikimedia.org/${title}.jpg`,
        thumbwidth: 1280,
        thumbheight: 850,
        mime: "image/jpeg",
        descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
        ...info,
      },
    ],
  });

  it("keeps real photos and links the Commons file page", () => {
    const out = normalizeWikimedia({ query: { pages: [page("File:Istanbul_panorama.jpg")] } }, "Istanbul");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: "wikimedia",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Istanbul_panorama.jpg",
      alt: "Istanbul panorama",
    });
  });

  it("filters maps, flags, logos, tiny images and svgs", () => {
    const out = normalizeWikimedia(
      {
        query: {
          pages: [
            page("File:Istanbul_location_map.jpg"),
            page("File:Flag_of_Turkey.png"),
            page("File:City_logo.png"),
            page("File:Tiny.jpg", { thumbwidth: 200, thumbheight: 100 }),
            page("File:Diagram.svg", { mime: "image/svg+xml" }),
            page("File:Hagia_Sophia.jpg"),
          ],
        },
      },
      "Istanbul"
    );
    expect(out.map((p) => p.alt)).toEqual(["Hagia Sophia"]);
  });

  it("strips HTML from the Commons artist credit", () => {
    const out = normalizeWikimedia(
      {
        query: {
          pages: [page("File:Bosphorus.jpg", { extmetadata: { Artist: { value: '<a href="x">Jane D</a>' } } })],
        },
      },
      "Istanbul"
    );
    expect(out[0].photographer).toBe("Jane D");
  });
});

// ---------- provider selection ----------

describe("resolveProvider", () => {
  it("honours an explicit CITY_MEDIA_PROVIDER", () => {
    expect(resolveProvider({ CITY_MEDIA_PROVIDER: "wikimedia", PEXELS_API_KEY: "k" }).name).toBe("wikimedia");
    expect(resolveProvider({ CITY_MEDIA_PROVIDER: "unsplash" }).name).toBe("unsplash");
  });

  it("defaults to pexels when a key is set, else wikimedia", () => {
    expect(resolveProvider({ PEXELS_API_KEY: "k" }).name).toBe("pexels");
    expect(resolveProvider({}).name).toBe("wikimedia");
  });

  it("ignores an unknown CITY_MEDIA_PROVIDER value", () => {
    expect(resolveProvider({ CITY_MEDIA_PROVIDER: "flickr" }).name).toBe("wikimedia");
  });
});

// ---------- cache TTL logic ----------

describe("isFresh", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  it("is fresh strictly inside the 30-day TTL", () => {
    expect(isFresh(new Date(now.getTime() - CITY_MEDIA_TTL_MS + 1000), now)).toBe(true);
    expect(isFresh(new Date(now.getTime() - CITY_MEDIA_TTL_MS), now)).toBe(false);
  });
});

describe("getCityMedia", () => {
  // Force the pexels provider so the cache layer makes exactly one fetch.
  beforeEach(() => {
    vi.stubEnv("CITY_MEDIA_PROVIDER", "pexels");
    vi.stubEnv("PEXELS_API_KEY", "test-key");
  });

  const pexelsResponse = {
    photos: [
      {
        width: 1600,
        height: 1000,
        url: "https://www.pexels.com/photo/1/",
        alt: "fresh shot",
        photographer: "P",
        photographer_url: "https://www.pexels.com/@p",
        src: { large2x: "https://images.pexels.com/fresh.jpg" },
      },
    ],
  };

  const okFetch = () =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(pexelsResponse), { status: 200 }));

  it("serves a fresh row from the DB without fetching", async () => {
    const fetchSpy = okFetch();
    vi.stubGlobal("fetch", fetchSpy);
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo({ alt: "cached" })]),
      fetchedAt: new Date(), // fresh
    });
    const out = await getCityMedia("Istanbul", "Türkiye");
    expect(out[0].alt).toBe("cached");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.cityMedia.upsert).not.toHaveBeenCalled();
  });

  it("refetches and upserts when the row is older than the TTL", async () => {
    const fetchSpy = okFetch();
    vi.stubGlobal("fetch", fetchSpy);
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo({ alt: "stale" })]),
      fetchedAt: new Date(Date.now() - CITY_MEDIA_TTL_MS - 1000),
    });
    const out = await getCityMedia("Istanbul", "Türkiye");
    expect(out[0].alt).toBe("fresh shot");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(db.cityMedia.upsert).toHaveBeenCalledTimes(1);
    const args = db.cityMedia.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ city_country: { city: "Istanbul", country: "Türkiye" } });
    expect(args.create.provider).toBe("pexels");
    expect(JSON.parse(args.create.photos)[0].url).toBe("https://images.pexels.com/fresh.jpg");
  });

  it("serves the stale row when the refetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo({ alt: "stale-but-served" })]),
      fetchedAt: new Date(Date.now() - CITY_MEDIA_TTL_MS - 1000),
    });
    const out = await getCityMedia("Istanbul", "Türkiye");
    expect(out[0].alt).toBe("stale-but-served");
    expect(db.cityMedia.upsert).not.toHaveBeenCalled();
  });

  it("returns [] when there is no row and the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const out = await getCityMedia("Nowhere", "Atlantis");
    expect(out).toEqual([]);
  });

  it("caches an empty-but-successful fetch so dead cities are not re-fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ photos: [] }), { status: 200 }))
    );
    const out = await getCityMedia("Nowhere", "Atlantis");
    expect(out).toEqual([]);
    expect(db.cityMedia.upsert).toHaveBeenCalledTimes(1);
  });

  it("filters malformed entries out of a cached row", async () => {
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo(), { junk: true }, "nope"]),
      fetchedAt: new Date(),
    });
    const out = await getCityMedia("Istanbul", "Türkiye");
    expect(out).toHaveLength(1);
  });
});

describe("getCachedCityMedia", () => {
  it("serves even a stale row and never fetches", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo({ alt: "old-hero" })]),
      fetchedAt: new Date(0),
    });
    const out = await getCachedCityMedia("Istanbul", "Türkiye");
    expect(out[0].alt).toBe("old-hero");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns [] when the DB read throws", async () => {
    db.cityMedia.findUnique.mockRejectedValue(new Error("db down"));
    await expect(getCachedCityMedia("Istanbul", "Türkiye")).resolves.toEqual([]);
  });
});
