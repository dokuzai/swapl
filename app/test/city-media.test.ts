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
  normalizeOpenverse,
  normalizePexels,
  normalizePixabay,
  normalizeUnsplash,
  normalizeWikimedia,
  resolveProvider,
} from "@/lib/city-media/providers";
import {
  getCityMedia,
  getCachedCityMedia,
  getCityIllustration,
  isFresh,
  CITY_MEDIA_TTL_MS,
} from "@/lib/city-media";
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

describe("normalizeOpenverse", () => {
  const result = (over: Record<string, unknown> = {}) => ({
    title: "Istanbul postcard",
    url: "https://upload.wikimedia.org/istanbul.jpg",
    width: 2000,
    height: 1400,
    creator: "Jane D",
    creator_url: "https://www.flickr.com/people/jane",
    foreign_landing_url: "https://www.flickr.com/photos/jane/1",
    tags: [{ name: "istanbul" }],
    ...over,
  });

  it("maps the Openverse search payload to the normalized shape", () => {
    const out = normalizeOpenverse({ results: [result()] }, "Istanbul");
    expect(out).toEqual([
      {
        url: "https://upload.wikimedia.org/istanbul.jpg",
        width: 2000,
        height: 1400,
        alt: "Istanbul postcard",
        photographer: "Jane D",
        photographerUrl: "https://www.flickr.com/people/jane",
        sourceUrl: "https://www.flickr.com/photos/jane/1",
        provider: "openverse",
      },
    ]);
  });

  it("falls back to foreign_landing_url for the creator link and fills empty alts", () => {
    const out = normalizeOpenverse(
      {
        results: [
          result({
            title: "",
            creator: " ",
            creator_url: null,
            tags: [{ name: "istanbul" }, { name: "postcard" }],
          }),
        ],
      },
      "Istanbul"
    );
    expect(out[0].alt).toBe("Istanbul illustration");
    expect(out[0].photographer).toBeUndefined();
    expect(out[0].photographerUrl).toBe("https://www.flickr.com/photos/jane/1");
  });

  it("drops tiny images but keeps results without dimensions", () => {
    const out = normalizeOpenverse(
      {
        results: [
          result({ title: "Tiny Istanbul postcard", width: 640 }),
          result({ title: "Istanbul postcard, unknown size", width: null, height: null }),
        ],
      },
      "Istanbul"
    );
    expect(out.map((p) => p.alt)).toEqual(["Istanbul postcard, unknown size"]);
    expect(out[0].width).toBe(0);
  });

  it("filters maps, flags, logos and url-less results", () => {
    const out = normalizeOpenverse(
      {
        results: [
          result({ title: "Istanbul location map" }),
          result({ title: "Istanbul Metro Logo" }),
          result({ title: "Coat of arms of Istanbul" }),
          result({ url: undefined }),
          result({ title: "Galata tower drawing" }),
        ],
      },
      "Istanbul"
    );
    expect(out.map((p) => p.alt)).toEqual(["Galata tower drawing"]);
  });

  it("hard-requires a city mention AND an art signal (title or tags)", () => {
    const out = normalizeOpenverse(
      {
        results: [
          result({ title: "Random beer mug", tags: [] }),
          result({ title: "Tagged only", tags: [{ name: "Istanbul skyline" }, { name: "illustration" }] }),
          result({ title: "Old Istanbul lithograph", tags: [] }),
          // Regression: a car-brochure scan that name-drops the city must not
          // become the hero (this exact shape shipped a BMW ad for Tokyo).
          result({ title: "BMW 1 Series brochure, Istanbul postcard", tags: [] }),
        ],
      },
      "istanbul" // case-insensitive both ways
    );
    expect(out.map((p) => p.alt)).toEqual(["Tagged only", "Old Istanbul lithograph"]);
  });

  it("returns [] for malformed payloads", () => {
    expect(normalizeOpenverse(null, "X")).toEqual([]);
    expect(normalizeOpenverse({ results: "nope" }, "X")).toEqual([]);
  });
});

describe("normalizePixabay", () => {
  it("maps hits, prefers largeImageURL and drops tiny illustrations", () => {
    const out = normalizePixabay(
      {
        hits: [
          {
            largeImageURL: "https://pixabay.com/get/large.jpg",
            webformatURL: "https://pixabay.com/get/web.jpg",
            imageWidth: 1920,
            imageHeight: 1080,
            tags: "istanbul, postcard",
            user: "artist1",
            pageURL: "https://pixabay.com/illustrations/istanbul-1/",
          },
          { webformatURL: "https://pixabay.com/get/small.jpg", imageWidth: 640 },
        ],
      },
      "Istanbul"
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      url: "https://pixabay.com/get/large.jpg",
      alt: "istanbul, postcard",
      photographer: "artist1",
      sourceUrl: "https://pixabay.com/illustrations/istanbul-1/",
      provider: "pixabay",
    });
  });

  it("returns [] for malformed payloads", () => {
    expect(normalizePixabay(null, "X")).toEqual([]);
    expect(normalizePixabay({ hits: "nope" }, "X")).toEqual([]);
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
    expect(args.where).toEqual({
      city_country_kind: { city: "Istanbul", country: "Türkiye", kind: "photo" },
    });
    expect(args.create.kind).toBe("photo");
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

// ---------- kind="illustration" (Openverse-backed hero) ----------

describe("getCityMedia kind=illustration / getCityIllustration", () => {
  const openverseResponse = (results: unknown[]) =>
    new Response(JSON.stringify({ result_count: results.length, results }), { status: 200 });

  const openverseResult = {
    title: "Istanbul postcard",
    url: "https://upload.wikimedia.org/istanbul.jpg",
    width: 2000,
    height: 1400,
    creator: "Jane D",
    creator_url: "https://www.flickr.com/people/jane",
    foreign_landing_url: "https://www.flickr.com/photos/jane/1",
    tags: [{ name: "istanbul" }],
  };

  it("reads and writes the illustration row, keyed by kind", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(openverseResponse([openverseResult]));
    vi.stubGlobal("fetch", fetchSpy);

    const out = await getCityIllustration("Istanbul", "Türkiye");
    expect(out?.provider).toBe("openverse");
    expect(out?.url).toBe("https://upload.wikimedia.org/istanbul.jpg");

    expect(db.cityMedia.findUnique).toHaveBeenCalledWith({
      where: { city_country_kind: { city: "Istanbul", country: "Türkiye", kind: "illustration" } },
    });
    const args = db.cityMedia.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      city_country_kind: { city: "Istanbul", country: "Türkiye", kind: "illustration" },
    });
    expect(args.create.kind).toBe("illustration");
    expect(args.create.provider).toBe("openverse");
    // Only the keyless Openverse tier ran (first query already had results).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("api.openverse.org/v1/images/");
    expect(fetchSpy.mock.calls[0][0]).toContain("license_type=all-cc");
    expect(fetchSpy.mock.calls[0][0]).toContain("category=illustration%2Cdigitized_artwork");
  });

  it("cascades to the category-less Openverse query when the strict one is empty", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(openverseResponse([]))
      .mockResolvedValueOnce(openverseResponse([openverseResult]));
    vi.stubGlobal("fetch", fetchSpy);

    const out = await getCityIllustration("Istanbul", "Türkiye");
    expect(out?.alt).toBe("Istanbul postcard");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).not.toContain("category=");
  });

  it("serves a fresh illustration row without touching the photo cache or the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo({ alt: "cached illustration", provider: "openverse" })]),
      fetchedAt: new Date(),
    });
    const out = await getCityIllustration("Istanbul", "Türkiye");
    expect(out?.alt).toBe("cached illustration");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when no provider yields anything (SVG postcard fallback)", async () => {
    // mockImplementation: each call needs its own Response (bodies are single-use).
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => openverseResponse([])));
    await expect(getCityIllustration("Nowhere", "Atlantis")).resolves.toBeNull();
    // The empty-but-successful result is still cached.
    expect(db.cityMedia.upsert).toHaveBeenCalledTimes(1);
    expect(db.cityMedia.upsert.mock.calls[0][0].create.kind).toBe("illustration");
  });

  it("falls back to Pixabay when Openverse is empty and a key is set", async () => {
    vi.stubEnv("PIXABAY_API_KEY", "pk");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(openverseResponse([]))
      .mockResolvedValueOnce(openverseResponse([]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hits: [
              {
                largeImageURL: "https://pixabay.com/get/ist.jpg",
                imageWidth: 1920,
                imageHeight: 1080,
                tags: "istanbul",
                user: "artist1",
                pageURL: "https://pixabay.com/illustrations/ist-1/",
              },
            ],
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const out = await getCityIllustration("Istanbul", "Türkiye");
    expect(out?.provider).toBe("pixabay");
    expect(fetchSpy.mock.calls[2][0]).toContain("pixabay.com/api");
    // The row records the upstream that actually answered.
    expect(db.cityMedia.upsert.mock.calls[0][0].create.provider).toBe("pixabay");
  });

  it("serves the stale illustration row when Openverse errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    db.cityMedia.findUnique.mockResolvedValue({
      photos: JSON.stringify([photo({ alt: "stale illustration", provider: "openverse" })]),
      fetchedAt: new Date(Date.now() - CITY_MEDIA_TTL_MS - 1000),
    });
    const out = await getCityIllustration("Istanbul", "Türkiye");
    expect(out?.alt).toBe("stale illustration");
    expect(db.cityMedia.upsert).not.toHaveBeenCalled();
  });
});

describe("getCachedCityMedia", () => {
  it("defaults to the photo kind and accepts an explicit kind", async () => {
    db.cityMedia.findUnique.mockResolvedValue(null);
    await getCachedCityMedia("Istanbul", "Türkiye");
    expect(db.cityMedia.findUnique).toHaveBeenCalledWith({
      where: { city_country_kind: { city: "Istanbul", country: "Türkiye", kind: "photo" } },
    });
    await getCachedCityMedia("Istanbul", "Türkiye", "illustration");
    expect(db.cityMedia.findUnique).toHaveBeenLastCalledWith({
      where: { city_country_kind: { city: "Istanbul", country: "Türkiye", kind: "illustration" } },
    });
  });

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
