// Coarse geo-IP from request headers. On Vercel these are injected on every
// request (no external lookup, no stored IP). Returns nulls off-platform/local.

export type GeoFix = {
  countryCode: string | null; // ISO-3166-1 alpha-2
  region: string | null;      // state/region code
  city: string | null;
};

export function geoFromHeaders(req: Request): GeoFix {
  const h = req.headers;
  const countryCode = clean(h.get("x-vercel-ip-country"));
  const region = clean(h.get("x-vercel-ip-country-region"));
  // City header is URL-encoded (e.g. "San%20Francisco").
  const rawCity = h.get("x-vercel-ip-city");
  const city = rawCity ? clean(safeDecode(rawCity)) : null;
  return { countryCode, region, city };
}

// Midnight UTC for a given instant — the canonical "day" key.
export function dayKey(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function clean(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
