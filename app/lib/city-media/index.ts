// Per-city media cache, mirroring the CityArt pattern: serve from the
// CityMedia row when fresh (30-day TTL), refetch otherwise, and on upstream
// failure serve the stale row if one exists — never throw to the page.
//
// Rows are keyed (city, country, kind): kind="photo" for real city photos
// (Pexels/Unsplash/Wikimedia), kind="illustration" for CC-licensed city
// illustrations (Openverse, optional Pixabay) used by the listing hero.
//
// Server-side only: provider keys are read from env inside lib/city-media and
// never serialized to the client (only the normalized CityPhoto list is).

import { prisma, parseJSON, stringifyJSON } from "@/lib/db";
import { resolveProvider, illustrationProvider } from "./providers";
import { judgeIllustrations } from "./judge";
import { isCityPhoto, type CityPhoto, type CityMediaKind } from "./types";

export type { CityPhoto, CityMediaKind } from "./types";

export const CITY_MEDIA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < CITY_MEDIA_TTL_MS;
}

function parsePhotos(raw: string): CityPhoto[] {
  return parseJSON<unknown[]>(raw, []).filter(isCityPhoto);
}

function providerFor(kind: CityMediaKind) {
  return kind === "illustration" ? illustrationProvider : resolveProvider();
}

/**
 * Cached-only read: returns whatever the DB has (even stale), never hits the
 * network. Used where a fetch must not add latency (browse cards).
 */
export async function getCachedCityMedia(
  city: string,
  country: string,
  kind: CityMediaKind = "photo"
): Promise<CityPhoto[]> {
  try {
    const row = await prisma.cityMedia.findUnique({
      where: { city_country_kind: { city, country, kind } },
    });
    return row ? parsePhotos(row.photos) : [];
  } catch (err) {
    console.error("[city-media:cached]", err);
    return [];
  }
}

/** Batch variant of getCachedCityMedia for listing grids — one query. */
export async function getCachedCityMediaMap(
  pairs: Array<{ city: string; country: string }>,
  kind: CityMediaKind = "photo"
): Promise<Map<string, CityPhoto[]>> {
  const map = new Map<string, CityPhoto[]>();
  const unique = [...new Map(pairs.map((p) => [`${p.city} ${p.country}`, p])).values()];
  if (unique.length === 0) return map;
  try {
    const rows = await prisma.cityMedia.findMany({
      where: { kind, OR: unique.map(({ city, country }) => ({ city, country })) },
    });
    for (const row of rows) map.set(`${row.city} ${row.country}`, parsePhotos(row.photos));
  } catch (err) {
    console.error("[city-media:cached-map]", err);
  }
  return map;
}

export function cityMediaKey(city: string, country: string): string {
  return `${city} ${country}`;
}

/**
 * Full read-through cache: fresh row → serve; stale/missing → refetch from
 * the provider for the requested kind and upsert; fetch failure → serve stale
 * if present, else empty list. An empty-but-successful fetch is cached too,
 * so dead cities don't hammer the upstream on every page view.
 */
export async function getCityMedia(
  city: string,
  country: string,
  kind: CityMediaKind = "photo"
): Promise<CityPhoto[]> {
  let stale: CityPhoto[] | null = null;
  try {
    const row = await prisma.cityMedia.findUnique({
      where: { city_country_kind: { city, country, kind } },
    });
    if (row) {
      const photos = parsePhotos(row.photos);
      if (isFresh(row.fetchedAt)) return photos;
      stale = photos;
    }
  } catch (err) {
    console.error("[city-media:read]", err);
  }

  const provider = providerFor(kind);
  try {
    let photos = await provider.fetchPhotos(city, country);
    // Illustrations get an optional AI relevance pass before they are cached,
    // so one judged result set serves the whole 30-day TTL.
    if (kind === "illustration") photos = await judgeIllustrations(city, country, photos);
    const data = {
      photos: stringifyJSON(photos),
      // The illustration provider can fall through to Pixabay — record the
      // upstream that actually answered.
      provider: photos[0]?.provider ?? provider.name,
      fetchedAt: new Date(),
    };
    await prisma.cityMedia
      .upsert({
        where: { city_country_kind: { city, country, kind } },
        create: { city, country, kind, ...data },
        update: data,
      })
      .catch((err) => console.error("[city-media:write]", err));
    return photos;
  } catch (err) {
    console.error(`[city-media:${provider.name}]`, err);
    return stale ?? [];
  }
}

/**
 * The listing-hero illustration: full read-through (a cache miss fetches from
 * Openverse within the 4s provider timeout), first result or null. Null →
 * the page renders the SVG postcard exactly as before.
 */
export async function getCityIllustration(city: string, country: string): Promise<CityPhoto | null> {
  const illustrations = await getCityMedia(city, country, "illustration");
  return illustrations[0] ?? null;
}
