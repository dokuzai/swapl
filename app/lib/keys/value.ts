// Keys value derivation — unified valuation engine v2 (DOK-163, DOK-160).
//
// Turns a listing into a transparent, predictable "Keys per night" number.
// Keys are travel points, never money, so the formula stays explainable to a
// member in one line — no opaque pricing, no wild swings.
//
// The value is split into two persisted parts (see Listing schema):
//
//   BASE       = round( BASE_NIGHTLY_KEYS
//                       + sizePoints + sleepsPoints + locationTierPoints
//                       + verifiedBonus + aiFeatureBonus )   × roomsCoefficient
//   ADJUSTMENT = review feedback multiplier, clamped to ±FEEDBACK_BAND
//
//   nightlyKeys = clamp( round( base × (1 + adjustment) ) )
//
// BASE moves only when the home, its city tier, or the AI feature signal change
// (recomputed by the listing-valuation cron). ADJUSTMENT drifts slowly from
// review ratings within a hard band so a popular home is rewarded a little and
// a poorly-rated one nudged down a little, never flipped. Everything here is
// PURE + deterministic; the AI/persistence orchestration lives in
// lib/keys/valuation.ts and reads back into these helpers.

// Feedback band lives in the client-safe constants module so UI can read it
// without server imports; used here for the clamp and re-exported below.
import { FEEDBACK_BAND } from "./valuation-constants";

export const BASE_NIGHTLY_KEYS = 4;
export const MIN_NIGHTLY_KEYS = 3;
export const MAX_NIGHTLY_KEYS = 20;

// Feedback loop band (DOK-163): reviews may move a listing at most ±20% off its
// base, ever. Keeps the value stable and ungameable. Re-exported from the
// client-safe constants module (imported at the top of this file).
export { FEEDBACK_BAND };

// ---------- Location tier ----------
// Destination desirability, tier 1 (world-magnet) … tier 5 (standard). The tier
// is persisted per city (LocationTier table) and derived/refreshed by the
// valuation cron; this seed map is the deterministic fallback when a city has
// no persisted row yet (and the source of truth for the migration seed). See
// lib/keys/location-tier.ts for the scale + browse boost.
// Seeds preserve the original DOK-155 tiers (so legacy Keys values don't move):
// the old "tier 1" cities map to desirability 1, the old "tier 2" to 2. Newer
// strong-but-not-magnet destinations get 3/4; everything unknown is 5.
const TIER_1 = ["paris", "tokyo", "brooklyn", "amsterdam", "seoul"];
const TIER_2 = ["lisbon", "berlin", "istanbul", "cdmx", "marrakesh"];
const TIER_3 = ["barcelona", "rome", "london", "new york", "vienna"];
const TIER_4 = ["porto", "prague", "valencia", "naples", "lyon"];

const SEED_TIERS: Record<string, number> = {};
for (const c of TIER_1) SEED_TIERS[c] = 1;
for (const c of TIER_2) SEED_TIERS[c] = 2;
for (const c of TIER_3) SEED_TIERS[c] = 3;
for (const c of TIER_4) SEED_TIERS[c] = 4;

export function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase();
}

/** Seed/fallback desirability tier for a city (1..5). Unknown → 5 (standard). */
export function seedLocationTier(city: string): number {
  return SEED_TIERS[normalizeCityKey(city)] ?? 5;
}

/** Map a 1..5 desirability tier to bonus Keys. Bounded so it never dominates. */
export function locationTierPoints(tier: number): number {
  switch (clampTier(tier)) {
    case 1:
      return 4;
    case 2:
      return 2; // preserves the original DOK-155 tier-2 bonus
    case 3:
      return 1;
    case 4:
      return 1;
    default:
      return 0; // tier 5 — standard, no bonus
  }
}

export function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) return 5;
  return Math.max(1, Math.min(5, Math.round(tier)));
}

// ---------- Legacy 1|2|3 city tier (kept for back-compat) ----------
// The old API exposed cityTier(city) as 1|2|3. We keep it, mapping the new 1..5
// desirability scale down: 1→1, 2→2, anything else → 3.
export function cityTier(city: string): 1 | 2 | 3 {
  const t = seedLocationTier(city);
  if (t === 1) return 1;
  if (t === 2) return 2;
  return 3;
}

// ---------- Deterministic feature points ----------
// Size: +1 Key per 25 m², capped at +6 (so a palace doesn't run away).
export function sizePoints(sizeSqm: number): number {
  return Math.min(6, Math.floor(Math.max(0, sizeSqm) / 25));
}

// Sleeps: +1 Key per sleeping spot beyond 2, capped at +4.
export function sleepsPoints(sleeps: number): number {
  return Math.min(4, Math.max(0, sleeps - 2));
}

// A verified home is worth a small, fixed premium (trust signal).
export function verifiedBonus(isVerified: boolean): number {
  return isVerified ? 2 : 0;
}

// ---------- Rooms coefficient (DOK-160) ----------
// A private room is worth a fraction of the whole home. With multiple rooms
// offered the fraction rises but never reaches a full home. entire_place = 1.0.
export const PRIVATE_ROOM_BASE_COEFFICIENT = 0.5; // one private room
const PRIVATE_ROOM_PER_EXTRA = 0.12; // each extra offered room
const PRIVATE_ROOM_MAX_COEFFICIENT = 0.85; // never a whole-home equivalent

export function roomsCoefficient(spaceType: string, roomsOffered?: number | null): number {
  if (spaceType !== "private_room") return 1;
  const rooms = Math.max(1, Math.floor(roomsOffered ?? 1));
  const coeff = PRIVATE_ROOM_BASE_COEFFICIENT + (rooms - 1) * PRIVATE_ROOM_PER_EXTRA;
  return Math.min(PRIVATE_ROOM_MAX_COEFFICIENT, coeff);
}

// ---------- Inputs ----------
export type ValuableListing = {
  sizeSqm: number;
  sleeps: number;
  city: string;
  isVerified: boolean;
  // Optional v2 inputs — default to the legacy behaviour when omitted.
  spaceType?: string | null;
  roomsOffered?: number | null;
  /** Persisted desirability tier (1..5). Falls back to the seed map for the city. */
  locationTier?: number | null;
  /** Bounded AI feature signal in Keys (already clamped by the caller). */
  aiFeatureBonus?: number | null;
};

/** Round + clamp a raw Keys value into the allowed nightly range. */
export function clampNightly(raw: number): number {
  return Math.max(MIN_NIGHTLY_KEYS, Math.min(MAX_NIGHTLY_KEYS, Math.round(raw)));
}

// ---------- Capacity-based value (DOK-219) ----------
// A home's nightly Keys value is simply how many people it can host — its
// `sleeps` capacity. One night hosting an N-capacity home is worth N Keys, so N
// Keys buys N person-nights (e.g. N nights for one person, or one night for N).
// This deliberately replaces the old multi-factor valuation (size, location
// tier, verification, AI appeal, review feedback): the value is one transparent
// number a member can predict. The old helpers above are retained only for
// back-compat imports; they no longer drive the value.
export const MIN_CAPACITY_KEYS = 1; // a solo/1-guest place is worth 1/night

/** Keys-per-night = guest capacity, clamped to the allowed range. */
export function capacityNightlyKeys(sleeps: number): number {
  const n = Math.round(Number.isFinite(sleeps) ? sleeps : 0);
  return Math.max(MIN_CAPACITY_KEYS, Math.min(MAX_NIGHTLY_KEYS, n));
}

/**
 * The BASE value-per-night. Now just the home's capacity (DOK-219). Persisted as
 * Listing.nightlyKeysBase; with the feedback adjustment frozen at 0 the final
 * nightlyKeys equals this.
 */
export function computeBaseNightlyKeys(listing: ValuableListing): number {
  return capacityNightlyKeys(listing.sleeps);
}

/** Clamp a feedback adjustment into the hard ±FEEDBACK_BAND band. */
export function clampAdjustment(adjustment: number): number {
  if (!Number.isFinite(adjustment)) return 0;
  return Math.max(-FEEDBACK_BAND, Math.min(FEEDBACK_BAND, adjustment));
}

/**
 * Apply a persisted feedback adjustment to a persisted base. Used by
 * nightlyKeysFor when a listing has been valued by the cron.
 */
export function applyAdjustment(base: number, adjustment: number): number {
  return clampNightly(base * (1 + clampAdjustment(adjustment)));
}

/**
 * Derive the Keys-per-night value for a listing. Pure + deterministic.
 *
 * Back-compatible: with only the legacy inputs (size/sleeps/city/isVerified)
 * this returns exactly the same number as before for whole-home listings — the
 * deterministic fallback used everywhere the persisted value is absent.
 *
 * When persisted base/adjustment are supplied (the fast read path), they win:
 * the value is round(base × (1 + adjustment)) clamped.
 */
export function nightlyKeysFor(
  listing: ValuableListing & { nightlyKeysBase?: number | null; nightlyKeysAdjustment?: number | null },
): number {
  // Value = capacity (DOK-219). We ignore any persisted base/adjustment so that
  // even listings not yet recomputed by the cron/backfill transact at the new
  // capacity value immediately — the cached columns are display-only now.
  return capacityNightlyKeys(listing.sleeps);
}

const NIGHT_MS = 24 * 60 * 60 * 1000;

/** Whole nights between two dates, minimum 1. Rounds to the nearest whole day
 * to absorb the ±1h DST shift, so a stay spanning a spring-forward or fall-back
 * weekend still counts the correct number of nights.
 */
export function nightsBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  // Round to nearest whole day to absorb the ±1h DST shift.
  const days = Math.round(diffMs / NIGHT_MS);
  return Math.max(1, days);
}

/** Total Keys cost of a stay = nightlyKeys × nights. */
export function keysCostFor(nightlyKeys: number, nights: number): number {
  return nightlyKeys * nights;
}
