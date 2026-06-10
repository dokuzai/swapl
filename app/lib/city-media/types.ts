// Normalized city photo shape shared by every provider. Serializable so it
// can cross the server→client component boundary and be stored as JSON text
// in CityMedia.photos.

export const CITY_MEDIA_PROVIDERS = ["pexels", "unsplash", "wikimedia", "openverse", "pixabay"] as const;
export type CityMediaProviderName = (typeof CITY_MEDIA_PROVIDERS)[number];

/** What the CityMedia row caches: real photos or CC-licensed illustrations. */
export const CITY_MEDIA_KINDS = ["photo", "illustration"] as const;
export type CityMediaKind = (typeof CITY_MEDIA_KINDS)[number];

export type CityPhoto = {
  url: string;
  width: number;
  height: number;
  alt: string;
  photographer?: string;
  photographerUrl?: string;
  /** Page to credit/link back to (Pexels photo page, Wikimedia file page…). */
  sourceUrl?: string;
  provider: CityMediaProviderName;
};

export type CityMediaProvider = {
  name: CityMediaProviderName;
  /**
   * Fetch up to ~8 landscape photos for a city. Must throw on upstream
   * failure (HTTP error, timeout) so the cache layer can fall back to a
   * stale row; an empty array means "provider answered, found nothing".
   */
  fetchPhotos(city: string, country: string): Promise<CityPhoto[]>;
};

export function isCityPhoto(v: unknown): v is CityPhoto {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.url === "string" &&
    typeof p.width === "number" &&
    typeof p.height === "number" &&
    typeof p.alt === "string" &&
    typeof p.provider === "string" &&
    (CITY_MEDIA_PROVIDERS as readonly string[]).includes(p.provider)
  );
}
