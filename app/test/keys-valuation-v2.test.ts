// Unified nightly-Keys valuation v2 (DOK-163, DOK-160): AI feature signal,
// location tier, review feedback loop, rooms coefficient. Tests focus on the
// pure engine — stability (no swings), bounding/clamp, deterministic fallback
// without an AI key, the rooms coefficient, the feedback band + per-cycle cap,
// and that the location tier never zeroes out small centers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_NIGHTLY_KEYS,
  MAX_NIGHTLY_KEYS,
  FEEDBACK_BAND,
  computeBaseNightlyKeys,
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

describe("deterministic base — back-compat + bounding", () => {
  it("matches the legacy whole-home value (no AI, no tier override)", () => {
    // base 4 + size(60→2) + sleeps(4→2) + tier2(2) + verified(2) = 12
    expect(computeBaseNightlyKeys({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true })).toBe(12);
  });

  it("clamps to the floor and ceiling", () => {
    expect(computeBaseNightlyKeys({ sizeSqm: 0, sleeps: 0, city: "Nowhere", isVerified: false })).toBeGreaterThanOrEqual(
      MIN_NIGHTLY_KEYS,
    );
    const huge = computeBaseNightlyKeys({
      sizeSqm: 1000,
      sleeps: 20,
      city: "Tokyo",
      isVerified: true,
      aiFeatureBonus: 3,
    });
    expect(huge).toBe(MAX_NIGHTLY_KEYS);
  });

  it("nightlyKeysFor prefers the persisted base+adjustment when present", () => {
    // persisted base 10, +20% → 12
    expect(nightlyKeysFor({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true, nightlyKeysBase: 10, nightlyKeysAdjustment: 0.2 })).toBe(12);
    // falls back to deterministic compute when no persisted base
    expect(nightlyKeysFor({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true })).toBe(12);
  });
});

describe("location tier — bounded boost, small centers stay visible", () => {
  it("never gives a tier-5 city a negative or huge swing", () => {
    expect(locationTierPoints(5)).toBe(0);
    expect(locationTierPoints(1)).toBe(4);
    // an unknown small town is tier 5 — no bonus, but still a real value
    expect(seedLocationTier("Tiny Village")).toBe(5);
    expect(computeBaseNightlyKeys({ sizeSqm: 40, sleeps: 2, city: "Tiny Village", isVerified: false })).toBeGreaterThanOrEqual(
      MIN_NIGHTLY_KEYS,
    );
  });

  it("browse boost is small and capped (small centers not buried)", () => {
    expect(browseTierBoost(5)).toBe(0);
    expect(browseTierBoost(1)).toBe(BROWSE_TIER_MAX_BOOST);
    // monotonic, never exceeds the cap
    for (let t = 1; t <= 5; t++) {
      expect(browseTierBoost(t)).toBeGreaterThanOrEqual(0);
      expect(browseTierBoost(t)).toBeLessThanOrEqual(BROWSE_TIER_MAX_BOOST);
    }
  });
});

describe("rooms coefficient (DOK-160)", () => {
  it("entire_place is full value; a private room is a fraction", () => {
    expect(roomsCoefficient("entire_place")).toBe(1);
    expect(roomsCoefficient("private_room", 1)).toBe(0.5);
    expect(roomsCoefficient("private_room", 3)).toBeGreaterThan(0.5);
    // never reaches a whole home even with many rooms
    expect(roomsCoefficient("private_room", 99)).toBeLessThan(1);
  });

  it("a private room is worth fewer Keys/night than the whole home", () => {
    const whole = computeBaseNightlyKeys({ sizeSqm: 80, sleeps: 4, city: "Lisbon", isVerified: true, spaceType: "entire_place" });
    const room = computeBaseNightlyKeys({ sizeSqm: 80, sleeps: 4, city: "Lisbon", isVerified: true, spaceType: "private_room", roomsOffered: 1 });
    expect(room).toBeLessThan(whole);
    expect(room).toBeGreaterThanOrEqual(MIN_NIGHTLY_KEYS);
  });
});

describe("feedback loop — band, threshold, per-cycle cap, anti-gaming", () => {
  it("target adjustment stays inside ±band for any rating", () => {
    for (const r of [1, 2, 3, 3.4, 4, 5]) {
      const t = feedbackTargetAdjustment(r);
      expect(t).toBeGreaterThanOrEqual(-FEEDBACK_BAND);
      expect(t).toBeLessThanOrEqual(FEEDBACK_BAND);
    }
    expect(feedbackTargetAdjustment(5)).toBeCloseTo(FEEDBACK_BAND, 5);
  });

  it("is frozen below the minimum review count (anti-gaming)", () => {
    const next = nextFeedbackAdjustment({ current: 0, avgRating: 5, reviewCount: FEEDBACK_MIN_REVIEWS - 1 });
    expect(next).toBe(0);
  });

  it("moves at most one small step per cycle (no swings)", () => {
    const step1 = nextFeedbackAdjustment({ current: 0, avgRating: 5, reviewCount: 10 });
    expect(Math.abs(step1)).toBeLessThanOrEqual(FEEDBACK_STEP_PER_CYCLE + 1e-9);
    const step2 = nextFeedbackAdjustment({ current: step1, avgRating: 5, reviewCount: 10 });
    expect(step2).toBeGreaterThan(step1);
    expect(Math.abs(step2 - step1)).toBeLessThanOrEqual(FEEDBACK_STEP_PER_CYCLE + 1e-9);
  });

  it("converges to and never exceeds the band over many cycles", () => {
    let adj = 0;
    for (let i = 0; i < 100; i++) adj = nextFeedbackAdjustment({ current: adj, avgRating: 5, reviewCount: 10 });
    expect(adj).toBeLessThanOrEqual(FEEDBACK_BAND + 1e-9);
    expect(adj).toBeCloseTo(FEEDBACK_BAND, 5);
  });

  it("applyAdjustment clamps the resulting nightly value", () => {
    expect(applyAdjustment(20, 0.2)).toBe(MAX_NIGHTLY_KEYS);
    expect(clampAdjustment(5)).toBe(FEEDBACK_BAND);
    expect(clampAdjustment(-5)).toBe(-FEEDBACK_BAND);
  });
});

describe("AI feature valuation — env-gated, bounded, deterministic fallback", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.KIMI_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  it("with no AI key, falls back to a deterministic bounded bonus", async () => {
    const v = await valuateListingFeatures({
      city: "Lisbon",
      spaceType: "entire_place",
      sizeSqm: 60,
      sleeps: 4,
      photoCount: 6,
      amenities: ["Balcony", "Pool", "AC", "Washer", "Dryer", "Parking"],
      description: "x".repeat(420),
    });
    expect(v.source).toBe("fallback");
    expect(v.bonus).toBeLessThanOrEqual(AI_FEATURE_BONUS_MAX);
    expect(v.bonus).toBeGreaterThanOrEqual(-2);
    expect(Array.isArray(v.factors)).toBe(true);
  });

  it("same inputs → same fallback bonus (stable, no swing)", async () => {
    const input = {
      city: "Lisbon",
      spaceType: "entire_place",
      sizeSqm: 60,
      sleeps: 4,
      photoCount: 0,
      amenities: [] as string[],
      description: "short",
    };
    const a = await valuateListingFeatures(input);
    const b = await valuateListingFeatures(input);
    expect(a.bonus).toBe(b.bonus);
  });
});

describe("composeValuation — stability + fallback == deterministic", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    for (const k of ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "KIMI_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("is deterministic across runs with the same input (no swing)", async () => {
    const a = await composeValuation(SAMPLE);
    const b = await composeValuation(SAMPLE);
    expect(b).toEqual(a);
  });

  it("without reviews, adjustment is 0 and base drives the value", async () => {
    const v = await composeValuation(SAMPLE);
    expect(v.nightlyKeysAdjustment).toBe(0);
    expect(v.nightlyKeys).toBe(applyAdjustment(v.nightlyKeysBase, 0));
    expect(v.explanation.feedback.applied).toBe(false);
  });

  it("a well-reviewed home drifts up at most one cycle step, never beyond the band", async () => {
    const reviewed = { ...SAMPLE, reviewCount: 8, avgRating: 5, currentAdjustment: 0 };
    const v = await composeValuation(reviewed);
    expect(v.nightlyKeysAdjustment).toBeGreaterThan(0);
    expect(v.nightlyKeysAdjustment).toBeLessThanOrEqual(FEEDBACK_BAND + 1e-9);
    expect(v.explanation.feedback.applied).toBe(true);
  });

  it("explanation exposes structured factors + AI source for the UI", async () => {
    const v = await composeValuation(SAMPLE);
    expect(v.explanation.version).toBe(2);
    expect(v.explanation.ai.source).toBe("fallback");
    expect(v.explanation.factors.find((f) => f.key === "base")?.points).toBe(4);
    expect(typeof v.explanation.locationTier).toBe("number");
  });
});
