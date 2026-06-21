// Nightly-Keys valuation (DOK-219): value = the home's guest capacity (sleeps).
// The old multi-factor engine (size, location tier, verification, AI appeal,
// review feedback) is retired — composeValuation now emits the capacity with the
// feedback adjustment frozen at 0. A few pure helpers (rooms coefficient, tier
// points, feedback math, AI fallback) still exist for back-compat and are kept
// under unit test here even though they no longer drive the value.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_NIGHTLY_KEYS,
  MIN_CAPACITY_KEYS,
  FEEDBACK_BAND,
  computeBaseNightlyKeys,
  capacityNightlyKeys,
  nightlyKeysFor,
  applyAdjustment,
  clampAdjustment,
  roomsCoefficient,
  locationTierPoints,
  seedLocationTier,
} from "@/lib/keys/value";
import {
  composeValuation,
  nextFeedbackAdjustment,
  feedbackTargetAdjustment,
  FEEDBACK_MIN_REVIEWS,
  FEEDBACK_STEP_PER_CYCLE,
} from "@/lib/keys/valuation";
import { browseTierBoost, BROWSE_TIER_MAX_BOOST } from "@/lib/keys/location-tier";
import { valuateListingFeatures, AI_FEATURE_BONUS_MAX } from "@/lib/ai/listing-valuation";

const SAMPLE = {
  city: "Lisbon",
  sizeSqm: 60,
  sleeps: 4,
  isVerified: true,
  spaceType: "entire_place",
  photoCount: 6,
  amenities: ["Balcony", "Pool", "AC", "Washer", "Dryer", "Parking"],
  description: "x".repeat(420),
  reviewCount: 0,
  avgRating: null as number | null,
};

describe("capacity value — the only factor (DOK-219)", () => {
  it("base equals the home's capacity, ignoring size / city / verification", () => {
    expect(computeBaseNightlyKeys({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true })).toBe(4);
    expect(computeBaseNightlyKeys({ sizeSqm: 1000, sleeps: 4, city: "Tokyo", isVerified: true })).toBe(4);
    expect(computeBaseNightlyKeys({ sizeSqm: 18, sleeps: 2, city: "Tiny Village", isVerified: false })).toBe(2);
  });

  it("clamps to the floor (1) and ceiling", () => {
    expect(computeBaseNightlyKeys({ sizeSqm: 0, sleeps: 0, city: "Nowhere", isVerified: false })).toBe(MIN_CAPACITY_KEYS);
    expect(computeBaseNightlyKeys({ sizeSqm: 1000, sleeps: 99, city: "Tokyo", isVerified: true })).toBe(MAX_NIGHTLY_KEYS);
  });

  it("nightlyKeysFor returns capacity and ignores any persisted base/adjustment", () => {
    expect(
      nightlyKeysFor({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true, nightlyKeysBase: 10, nightlyKeysAdjustment: 0.2 }),
    ).toBe(4);
    expect(nightlyKeysFor({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true })).toBe(4);
  });

  it("a private room is valued by its own capacity (no separate coefficient)", () => {
    const room = computeBaseNightlyKeys({ sizeSqm: 80, sleeps: 2, city: "Lisbon", isVerified: true, spaceType: "private_room", roomsOffered: 1 });
    expect(room).toBe(2);
  });
});

describe("composeValuation — capacity, frozen feedback", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    for (const k of ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "KIMI_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("is deterministic and sets nightlyKeys = capacity, adjustment 0", async () => {
    const a = await composeValuation(SAMPLE);
    const b = await composeValuation(SAMPLE);
    expect(b).toEqual(a);
    expect(a.nightlyKeysBase).toBe(4);
    expect(a.nightlyKeys).toBe(4);
    expect(a.nightlyKeysAdjustment).toBe(0);
  });

  it("never drifts with reviews (feedback retired)", async () => {
    const v = await composeValuation({ ...SAMPLE, reviewCount: 8, avgRating: 5, currentAdjustment: 0 });
    expect(v.nightlyKeysAdjustment).toBe(0);
    expect(v.nightlyKeys).toBe(4);
    expect(v.explanation.feedback.applied).toBe(false);
  });

  it("explanation exposes a single capacity factor for the UI", async () => {
    const v = await composeValuation(SAMPLE);
    expect(v.explanation.version).toBe(2);
    expect(v.explanation.ai.source).toBe("fallback");
    expect(v.explanation.factors).toHaveLength(1);
    expect(v.explanation.factors[0]?.key).toBe("capacity");
    expect(v.explanation.factors[0]?.points).toBe(4);
  });
});

describe("capacity-nights symmetry", () => {
  it("host N-capacity for 1 night == stay solo for N nights", () => {
    expect(capacityNightlyKeys(7)).toBe(7);
    expect(capacityNightlyKeys(1)).toBe(1);
  });
});

// ---- Retained pure helpers (no longer drive the value, still unit-tested) ----

describe("rooms coefficient (retained helper)", () => {
  it("entire_place is full value; a private room is a fraction", () => {
    expect(roomsCoefficient("entire_place")).toBe(1);
    expect(roomsCoefficient("private_room", 1)).toBe(0.5);
    expect(roomsCoefficient("private_room", 99)).toBeLessThan(1);
  });
});

describe("location tier (retained helper)", () => {
  it("tier points are bounded; small towns are tier 5", () => {
    expect(locationTierPoints(5)).toBe(0);
    expect(locationTierPoints(1)).toBe(4);
    expect(seedLocationTier("Tiny Village")).toBe(5);
  });

  it("browse boost is small and capped", () => {
    expect(browseTierBoost(5)).toBe(0);
    expect(browseTierBoost(1)).toBe(BROWSE_TIER_MAX_BOOST);
    for (let t = 1; t <= 5; t++) {
      expect(browseTierBoost(t)).toBeGreaterThanOrEqual(0);
      expect(browseTierBoost(t)).toBeLessThanOrEqual(BROWSE_TIER_MAX_BOOST);
    }
  });
});

describe("feedback math (retained helper)", () => {
  it("target adjustment stays inside ±band", () => {
    for (const r of [1, 2, 3, 3.4, 4, 5]) {
      const t = feedbackTargetAdjustment(r);
      expect(t).toBeGreaterThanOrEqual(-FEEDBACK_BAND);
      expect(t).toBeLessThanOrEqual(FEEDBACK_BAND);
    }
  });

  it("is frozen below the review threshold and steps slowly above it", () => {
    expect(nextFeedbackAdjustment({ current: 0, avgRating: 5, reviewCount: FEEDBACK_MIN_REVIEWS - 1 })).toBe(0);
    const step1 = nextFeedbackAdjustment({ current: 0, avgRating: 5, reviewCount: 10 });
    expect(Math.abs(step1)).toBeLessThanOrEqual(FEEDBACK_STEP_PER_CYCLE + 1e-9);
  });

  it("applyAdjustment + clampAdjustment clamp correctly", () => {
    expect(applyAdjustment(20, 0.2)).toBe(MAX_NIGHTLY_KEYS);
    expect(clampAdjustment(5)).toBe(FEEDBACK_BAND);
    expect(clampAdjustment(-5)).toBe(-FEEDBACK_BAND);
  });
});

describe("AI feature valuation (retained helper, no longer used in value)", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    for (const k of ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "KIMI_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  it("falls back to a deterministic bounded bonus with no AI key", async () => {
    const v = await valuateListingFeatures({
      city: "Lisbon", spaceType: "entire_place", sizeSqm: 60, sleeps: 4,
      photoCount: 6, amenities: ["Balcony", "Pool"], description: "x".repeat(420),
    });
    expect(v.source).toBe("fallback");
    expect(v.bonus).toBeLessThanOrEqual(AI_FEATURE_BONUS_MAX);
  });
});
