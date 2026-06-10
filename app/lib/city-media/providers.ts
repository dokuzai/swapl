// City photo providers. All fetching is server-side only — API keys never
// reach the client. Each provider returns the normalized CityPhoto list;
// upstream failures throw so the cache layer (index.ts) can serve stale.

import type { CityPhoto, CityMediaProvider, CityMediaProviderName } from "./types";

export const FETCH_TIMEOUT_MS = 4_000;
const PER_PAGE = 8;
const USER_AGENT = "swapl/1.0 (https://swapl.fun; hello@swapl.fun)";

async function fetchJSON(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Provider responses are cached in our own DB (CityMedia) — skip Next's
    // fetch cache so we never double-cache.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${new URL(url).hostname}`);
  return res.json();
}

// ---------- Pexels ----------
// https://www.pexels.com/api/documentation/#photos-search
// Attribution requirement: visible "Photo: {name} / Pexels" credit + link.

type PexelsPhoto = {
  width: number;
  height: number;
  url: string; // photo page on pexels.com
  alt: string | null;
  photographer: string;
  photographer_url: string;
  src: { large2x?: string; large?: string; landscape?: string; original?: string };
};

export function normalizePexels(json: unknown, city: string): CityPhoto[] {
  const photos = (json as { photos?: PexelsPhoto[] })?.photos;
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p): CityPhoto | null => {
      const url = p?.src?.large2x ?? p?.src?.large ?? p?.src?.landscape ?? p?.src?.original;
      if (!url) return null;
      return {
        url,
        width: p.width ?? 0,
        height: p.height ?? 0,
        alt: p.alt?.trim() || `${city} city view`,
        photographer: p.photographer || undefined,
        photographerUrl: p.photographer_url || undefined,
        sourceUrl: p.url || undefined,
        provider: "pexels",
      };
    })
    .filter((p): p is CityPhoto => p !== null)
    .slice(0, PER_PAGE);
}

export const pexelsProvider: CityMediaProvider = {
  name: "pexels",
  async fetchPhotos(city) {
    const key = process.env.PEXELS_API_KEY;
    if (!key) throw new Error("PEXELS_API_KEY is not set");
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", `${city} city`);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", String(PER_PAGE));
    const json = await fetchJSON(url.toString(), { Authorization: key });
    return normalizePexels(json, city);
  },
};

// ---------- Unsplash (stub-ready) ----------
// https://unsplash.com/documentation#search-photos

type UnsplashPhoto = {
  width: number;
  height: number;
  alt_description: string | null;
  urls: { regular?: string; full?: string };
  links: { html?: string };
  user: { name?: string; links?: { html?: string } };
};

export function normalizeUnsplash(json: unknown, city: string): CityPhoto[] {
  const results = (json as { results?: UnsplashPhoto[] })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .map((p): CityPhoto | null => {
      const url = p?.urls?.regular ?? p?.urls?.full;
      if (!url) return null;
      return {
        url,
        width: p.width ?? 0,
        height: p.height ?? 0,
        alt: p.alt_description?.trim() || `${city} city view`,
        photographer: p.user?.name || undefined,
        photographerUrl: p.user?.links?.html || undefined,
        sourceUrl: p.links?.html || undefined,
        provider: "unsplash",
      };
    })
    .filter((p): p is CityPhoto => p !== null)
    .slice(0, PER_PAGE);
}

export const unsplashProvider: CityMediaProvider = {
  name: "unsplash",
  async fetchPhotos(city) {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) throw new Error("UNSPLASH_ACCESS_KEY is not set");
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", `${city} city`);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", String(PER_PAGE));
    const json = await fetchJSON(url.toString(), { Authorization: `Client-ID ${key}` });
    return normalizeUnsplash(json, city);
  },
};

// ---------- Wikimedia (keyless fallback) ----------
// Two calls: the Wikipedia REST summary for the lead image, then the action
// API with generator=images for the rest of the article's photos. Attribution
// links the Commons file page (descriptionurl).

// Tested against the title with underscores normalized to spaces, so \b works.
const WIKI_SKIP = /\b(map|flag|coat of arms|logo|icon|locator|seal|emblem|chart|diagram|graph|plan)\b/i;
const WIKI_OK_EXT = /\.(jpe?g|png|webp)$/i;

type WikiImageInfo = {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  url?: string;
  width?: number;
  height?: number;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: { Artist?: { value?: string } };
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

export function normalizeWikimedia(json: unknown, city: string): CityPhoto[] {
  const pages = (json as { query?: { pages?: Array<{ title?: string; imageinfo?: WikiImageInfo[] }> } })
    ?.query?.pages;
  if (!Array.isArray(pages)) return [];
  return pages
    .map((page): CityPhoto | null => {
      const info = page?.imageinfo?.[0];
      const title = page?.title ?? "";
      if (!info) return null;
      if (WIKI_SKIP.test(title.replace(/_/g, " "))) return null;
      if (!WIKI_OK_EXT.test(title) && !(info.mime ?? "").startsWith("image/jp")) return null;
      const url = info.thumburl ?? info.url;
      const width = info.thumbwidth ?? info.width ?? 0;
      const height = info.thumbheight ?? info.height ?? 0;
      if (!url || width < 500 || height < 280) return null;
      const artist = info.extmetadata?.Artist?.value ? stripHtml(info.extmetadata.Artist.value) : undefined;
      const cleanTitle = title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ");
      return {
        url,
        width,
        height,
        alt: cleanTitle || `${city} city view`,
        photographer: artist && artist.length <= 80 ? artist : undefined,
        sourceUrl: info.descriptionurl,
        provider: "wikimedia",
      };
    })
    .filter((p): p is CityPhoto => p !== null)
    .sort((a, b) => (b.width >= b.height ? 1 : 0) - (a.width >= a.height ? 1 : 0)) // landscape first
    .slice(0, PER_PAGE);
}

type WikiSummary = {
  originalimage?: { source?: string; width?: number; height?: number };
  content_urls?: { desktop?: { page?: string } };
};

export const wikimediaProvider: CityMediaProvider = {
  name: "wikimedia",
  async fetchPhotos(city) {
    const photos: CityPhoto[] = [];

    // 1. Lead image from the REST summary — almost always a good cover shot.
    try {
      const summary = (await fetchJSON(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`
      )) as WikiSummary;
      const img = summary?.originalimage;
      if (img?.source && (img.width ?? 0) >= 500) {
        photos.push({
          url: img.source,
          width: img.width ?? 0,
          height: img.height ?? 0,
          alt: `${city} — Wikipedia lead image`,
          sourceUrl: summary.content_urls?.desktop?.page,
          provider: "wikimedia",
        });
      }
    } catch {
      // Summary miss is non-fatal — the generator query below may still work.
    }

    // 2. All images on the article, with file-page URLs for attribution.
    const api = new URL("https://en.wikipedia.org/w/api.php");
    api.searchParams.set("action", "query");
    api.searchParams.set("format", "json");
    api.searchParams.set("formatversion", "2");
    api.searchParams.set("origin", "*");
    api.searchParams.set("generator", "images");
    api.searchParams.set("titles", city);
    api.searchParams.set("gimlimit", "30");
    api.searchParams.set("prop", "imageinfo");
    api.searchParams.set("iiprop", "url|size|mime|extmetadata");
    api.searchParams.set("iiurlwidth", "1280");
    const json = await fetchJSON(api.toString());
    for (const p of normalizeWikimedia(json, city)) {
      if (photos.length >= PER_PAGE) break;
      if (photos.some((existing) => existing.url === p.url)) continue;
      photos.push(p);
    }
    return photos;
  },
};

// ---------- Selection ----------

const PROVIDERS: Record<CityMediaProviderName, CityMediaProvider> = {
  pexels: pexelsProvider,
  unsplash: unsplashProvider,
  wikimedia: wikimediaProvider,
};

/**
 * CITY_MEDIA_PROVIDER env wins when set; otherwise "pexels" if a key is
 * configured, else the keyless "wikimedia".
 */
export function resolveProvider(
  env: Record<string, string | undefined> = process.env
): CityMediaProvider {
  const explicit = env.CITY_MEDIA_PROVIDER?.toLowerCase();
  if (explicit && explicit in PROVIDERS) return PROVIDERS[explicit as CityMediaProviderName];
  return env.PEXELS_API_KEY ? PROVIDERS.pexels : PROVIDERS.wikimedia;
}
