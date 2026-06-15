// Unified valuation orchestration (DOK-163).
//
// One coherent engine that composes a listing's persisted nightly value from:
//   1. the deterministic feature base (lib/keys/value.ts)
//   2. the persisted location-desirability tier (lib/keys/location-tier.ts)
//   3. a bounded AI feature signal (lib/ai/listing-valuation.ts, env-gated)
//   4. a bounded review feedback adjustment (this file)
//
// It produces { nightlyKeysBase, nightlyKeysAdjustment, nightlyKeys, tier,
// explanation } which the valuation cron persists onto the Listing row. Reads
// never run this — they read the persisted value via nightlyKeysFor.
//
// STABILITY GUARANTEES:
//   - The AI signal is clamped (lib/ai/listing-valuation) and only re-queried
//     when stale, so the base barely moves.
//   - The feedback adjustment is hard-capped at ±FEEDBACK_BAND from base AND
//     moves at most FEEDBACK_STEP_PER_CYCLE per cron cycle (no swings).
//   - Below FEEDBACK_MIN_REVIEWS reviews the adjustment is frozen (anti-gaming).

import { parseJSON } from "@/lib/db";
import {
  computeBaseNightlyKeys,
  applyAdjustment,
  clampAdjustment,
  roomsCoefficient,
  sizePoints,
  sleepsPoints,
  verifiedBonus,
  locationTierPoints,
  seedLocationTier,
  BASE_NIGHTLY_KEYS,
  FEEDBACK_BAND,
} from "@/lib/keys/value";
import {
  valuateListingFeatures,
  type AIFeatureValuation,
  type ValuationFactor,
} from "@/lib/ai/listing-valuation";
import type { ResolveOptions } from "@/lib/ai/providers";

// Feedback loop tunables (DOK-163). Defined in the client-safe constants module
// (re-exported here) so UI can read them without pulling this server module's
// db/AI imports into the browser bundle.
export { FEEDBACK_MIN_REVIEWS, FEEDBACK_STEP_PER_CYCLE } from "./valuation-constants";
import { FEEDBACK_MIN_REVIEWS, FEEDBACK_STEP_PER_CYCLE } from "./valuation-constants";
// Map an average 1..5 rating to a target adjustment within the band:
//   5★ → +band, 4★ → +band/2, ~3.4★ → 0, 2★ → −band/2, 1★ → −band.
const FEEDBACK_NEUTRAL_RATING = 3.4;

/** Target adjustment (within ±band) implied by an average review rating. */
export function feedbackTargetAdjustment(avgRating: number): number {
  const delta = (avgRating - FEEDBACK_NEUTRAL_RATING) / (5 - FEEDBACK_NEUTRAL_RATING);
  return clampAdjustment(delta * FEEDBACK_BAND);
}

/**
 * Move the current adjustment toward the review-implied target by at most one
 * cycle step, only once enough reviews exist. Returns the (clamped) next value.
 * Small per-cycle moves = no swings; the hard band caps the cumulative drift.
 */
export function nextFeedbackAdjustment(args: {
  current: number;
  avgRating: number | null;
  reviewCount: number;
}): number {
  const current = clampAdjustment(args.current);
  if (args.reviewCount < FEEDBACK_MIN_REVIEWS || args.avgRating == null) {
    return current; // frozen until the threshold is met
  }
  const target = feedbackTargetAdjustment(args.avgRating);
  const diff = target - current;
  if (Math.abs(diff) <= FEEDBACK_STEP_PER_CYCLE) return clampAdjustment(target);
  return clampAdjustment(current + Math.sign(diff) * FEEDBACK_STEP_PER_CYCLE);
}

// ---------- Explanation shape (persisted as Listing.valuationExplanation) ----------
export type ValuationExplanation = {
  version: 2;
  /** Final persisted base before feedback. */
  base: number;
  /** Persisted feedback adjustment multiplier (±band). */
  adjustment: number;
  /** Final nightly value = clamp(round(base*(1+adjustment))). */
  nightlyKeys: number;
  locationTier: number;
  spaceType: string;
  roomsCoefficient: number;
  /** Deterministic + tier + AI factors that build the base, each in Keys. */
  factors: ValuationFactor[];
  ai: { source: AIFeatureValuation["source"]; bonus: number; summary: string };
  feedback: {
    reviewCount: number;
    avgRating: number | null;
    applied: boolean; // false when below the review threshold
  };
};

export type ListingValuationInput = {
  city: string;
  country?: string;
  sizeSqm: number;
  sleeps: number;
  isVerified: boolean;
  spaceType: string;
  roomsOffered?: number | null;
  photoCount: number;
  amenities: string[];
  description: string;
  /** Persisted desirability tier (1..5); falls back to the seed map. */
  locationTier?: number | null;
  /** Current persisted feedback adjustment, to be advanced by one cycle. */
  currentAdjustment?: number | null;
  /** Review signal for the listing's host. */
  reviewCount: number;
  avgRating: number | null;
};

export type ComposedValuation = {
  nightlyKeysBase: number;
  nightlyKeysAdjustment: number;
  nightlyKeys: number;
  locationTier: number;
  aiSource: AIFeatureValuation["source"];
  explanation: ValuationExplanation;
};

/**
 * Compose the full valuation for one listing. Calls the AI feature appraiser
 * (env-gated; deterministic fallback when no key). PURE except for that single
 * AI call — persistence is the caller's job (the cron).
 */
export async function composeValuation(
  input: ListingValuationInput,
  opts: ResolveOptions = {},
): Promise<ComposedValuation> {
  const tier = input.locationTier ?? seedLocationTier(input.city);

  const ai = await valuateListingFeatures(
    {
      city: input.city,
      country: input.country,
      spaceType: input.spaceType,
      sizeSqm: input.sizeSqm,
      sleeps: input.sleeps,
      photoCount: input.photoCount,
      amenities: input.amenities,
      description: input.description,
    },
    opts,
  );

  const base = computeBaseNightlyKeys({
    sizeSqm: input.sizeSqm,
    sleeps: input.sleeps,
    city: input.city,
    isVerified: input.isVerified,
    spaceType: input.spaceType,
    roomsOffered: input.roomsOffered,
    locationTier: tier,
    aiFeatureBonus: ai.bonus,
  });

  const adjustment = nextFeedbackAdjustment({
    current: input.currentAdjustment ?? 0,
    avgRating: input.avgRating,
    reviewCount: input.reviewCount,
  });

  const nightlyKeys = applyAdjustment(base, adjustment);
  const coeff = roomsCoefficient(input.spaceType, input.roomsOffered);

  const factors: ValuationFactor[] = [
    { key: "base", label: "Base", points: BASE_NIGHTLY_KEYS },
    { key: "size", label: "Size", points: sizePoints(input.sizeSqm) },
    { key: "sleeps", label: "Sleeps", points: sleepsPoints(input.sleeps) },
    { key: "location_tier", label: "Location appeal", points: locationTierPoints(tier) },
    { key: "verified", label: "Verified home", points: verifiedBonus(input.isVerified) },
    { key: "ai_appeal", label: "Home appeal (AI)", points: ai.bonus },
    // Always surface location_tier (even at +0) and the AI appeal factor so the
    // explainer can show the "standard, valued equally" / "most homes score 0"
    // reassurance to small-town and average hosts — a 0 here is meaningful, not
    // noise to hide. Other zero-valued factors stay collapsed.
  ].filter((f) => f.points !== 0 || f.key === "base" || f.key === "location_tier" || f.key === "ai_appeal");

  const explanation: ValuationExplanation = {
    version: 2,
    base,
    adjustment,
    nightlyKeys,
    locationTier: tier,
    spaceType: input.spaceType,
    roomsCoefficient: coeff,
    factors,
    ai: { source: ai.source, bonus: ai.bonus, summary: ai.summary },
    feedback: {
      reviewCount: input.reviewCount,
      avgRating: input.avgRating,
      applied: input.reviewCount >= FEEDBACK_MIN_REVIEWS,
    },
  };

  return {
    nightlyKeysBase: base,
    nightlyKeysAdjustment: adjustment,
    nightlyKeys,
    locationTier: tier,
    aiSource: ai.source,
    explanation,
  };
}

/** Safely parse a persisted valuationExplanation JSON string for the UI/DTO. */
export function parseValuationExplanation(s: string | null | undefined): ValuationExplanation | null {
  const parsed = parseJSON<ValuationExplanation | null>(s, null);
  if (!parsed || typeof parsed !== "object" || parsed.version !== 2) return null;
  return parsed;
}
