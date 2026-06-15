// Location desirability tier (DOK-163).
//
// A small, bounded signal of how *desirable a destination* a city is — tourist
// appeal, not raw population — that feeds BOTH the Keys valuation (a stronger
// destination is worth a little more per night) AND the browse ranking (strong
// destinations surface a little higher). It is persisted per city in the
// LocationTier table and refreshed by the listing-valuation cron.
//
// SCALE (1 = most desirable … 5 = standard):
//   tier 1  world-magnet destinations (Paris, Tokyo, NYC) ......... +4 Keys
//   tier 2  major, very popular cities (Lisbon, Berlin) ............ +2 Keys
//   tier 3  strong, well-known destinations (Barcelona, Rome) ...... +1 Key
//   tier 4  notable regional draws (Porto, Naples) ................. +1 Key
//   tier 5  everything else — standard, no bonus ................... +0 Keys
// (point values live in lib/keys/value.ts::locationTierPoints.)
//
// BROWSE BOOST is intentionally tiny and CAPPED so small towns never become
// invisible: at most BROWSE_TIER_MAX_BOOST score points separate a tier-1 from
// a tier-5 listing — far less than a featured/verified band or a good match.

import { prisma } from "@/lib/db";
import { normalizeCityKey, seedLocationTier, clampTier } from "@/lib/keys/value";

// Max browse score points a tier-1 city gets over a tier-5 city. Kept small on
// purpose (a single good match-trait is worth ~10) so desirability nudges
// ordering without burying quiet destinations.
export const BROWSE_TIER_MAX_BOOST = 6;

/** Browse ranking boost (score points) for a city's desirability tier. */
export function browseTierBoost(tier: number | null | undefined): number {
  const t = clampTier(tier ?? 5);
  // tier 1 → full boost, tier 5 → 0, linear in between.
  return Math.round(((5 - t) / 4) * BROWSE_TIER_MAX_BOOST);
}

/**
 * Resolve the persisted desirability tier for a set of cities, falling back to
 * the deterministic seed map for any city without a row. Returns a map keyed by
 * the normalized city key so callers can look up case-insensitively.
 */
export async function resolveLocationTiers(cities: string[]): Promise<Map<string, number>> {
  const keys = Array.from(new Set(cities.map(normalizeCityKey)));
  const out = new Map<string, number>();
  if (keys.length === 0) return out;

  const rows = await prisma.locationTier.findMany({ where: { city: { in: keys } } });
  for (const r of rows) out.set(r.city, clampTier(r.tier));
  // Fill gaps from the seed map so the engine always has a tier.
  for (const k of keys) if (!out.has(k)) out.set(k, seedLocationTier(k));
  return out;
}

/** Tier for a single city (persisted → seed fallback). */
export async function locationTierForCity(city: string): Promise<number> {
  const key = normalizeCityKey(city);
  const row = await prisma.locationTier.findUnique({ where: { city: key } });
  return row ? clampTier(row.tier) : seedLocationTier(key);
}

/**
 * Upsert a city's tier (idempotent). Used by the valuation cron to persist
 * seeded/AI-derived tiers. A "manual" source is never overwritten by "seed".
 */
export async function upsertLocationTier(
  city: string,
  tier: number,
  source: "seed" | "ai" | "manual" = "seed",
): Promise<void> {
  const key = normalizeCityKey(city);
  const existing = await prisma.locationTier.findUnique({ where: { city: key } });
  if (existing && existing.source === "manual" && source !== "manual") return;
  await prisma.locationTier.upsert({
    where: { city: key },
    create: { city: key, tier: clampTier(tier), source },
    update: { tier: clampTier(tier), source },
  });
}
