// Keys value derivation (DOK-155).
//
// Turns a listing into a transparent, predictable "Keys per night" number.
// Keys are travel points, never money, so the formula is deliberately simple
// and explainable to a member in one line — no opaque pricing.
//
//   nightlyKeys = round( BASE
//                        + sizePoints(sizeSqm)
//                        + sleepsPoints(sleeps)
//                        + cityTierPoints(city)
//                        + verifiedBonus(isVerified) )
//   clamped to [MIN_NIGHTLY_KEYS, MAX_NIGHTLY_KEYS].
//
// Rule of thumb the formula targets: a typical mid-size verified flat in a
// popular city is ~10 Keys/night; a small place in a quiet city ~5; a large
// verified home in a top-tier city ~16. Easy to reason about, no surprises.

export const BASE_NIGHTLY_KEYS = 4;
export const MIN_NIGHTLY_KEYS = 3;
export const MAX_NIGHTLY_KEYS = 20;

// City "tier" → extra Keys. Tier 1 = high-demand global cities, tier 2 =
// popular, tier 3 (everything else) = standard. Names are matched
// case-insensitively against the listing city. Kept small and visible on
// purpose; unknown cities simply fall to tier 3 (no bonus).
const TIER_1 = new Set(
  ["paris", "tokyo", "brooklyn", "amsterdam", "seoul"].map((c) => c),
);
const TIER_2 = new Set(
  ["lisbon", "berlin", "istanbul", "cdmx", "marrakesh"].map((c) => c),
);

export function cityTier(city: string): 1 | 2 | 3 {
  const key = city.trim().toLowerCase();
  if (TIER_1.has(key)) return 1;
  if (TIER_2.has(key)) return 2;
  return 3;
}

function cityTierPoints(city: string): number {
  switch (cityTier(city)) {
    case 1:
      return 4;
    case 2:
      return 2;
    default:
      return 0;
  }
}

// Size: +1 Key per 25 m², capped at +6 (so a palace doesn't run away).
function sizePoints(sizeSqm: number): number {
  return Math.min(6, Math.floor(Math.max(0, sizeSqm) / 25));
}

// Sleeps: +1 Key per sleeping spot beyond 2, capped at +4.
function sleepsPoints(sleeps: number): number {
  return Math.min(4, Math.max(0, sleeps - 2));
}

// A verified home is worth a small, fixed premium (trust signal).
function verifiedBonus(isVerified: boolean): number {
  return isVerified ? 2 : 0;
}

export type ValuableListing = {
  sizeSqm: number;
  sleeps: number;
  city: string;
  isVerified: boolean;
};

/** Derive the Keys-per-night value for a listing. Pure + deterministic. */
export function nightlyKeysFor(listing: ValuableListing): number {
  const raw =
    BASE_NIGHTLY_KEYS +
    sizePoints(listing.sizeSqm) +
    sleepsPoints(listing.sleeps) +
    cityTierPoints(listing.city) +
    verifiedBonus(listing.isVerified);
  return Math.max(MIN_NIGHTLY_KEYS, Math.min(MAX_NIGHTLY_KEYS, Math.round(raw)));
}

const NIGHT_MS = 24 * 60 * 60 * 1000;

/** Whole nights between two dates, floored, minimum 1. */
export function nightsBetween(from: Date, to: Date): number {
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / NIGHT_MS));
}

/** Total Keys cost of a stay = nightlyKeys × nights. */
export function keysCostFor(nightlyKeys: number, nights: number): number {
  return nightlyKeys * nights;
}
