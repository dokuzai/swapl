// Growth engine config helpers (DOK-157): tier resolution + waitlist position
// derive purely from the qualified-referral count. Pure functions, no DB.

import { describe, expect, it } from "vitest";
import {
  currentTier,
  nextTier,
  waitlistPosition,
  GROWTH_TIERS,
  WAITLIST_BASE,
  WAITLIST_STEP,
} from "@/lib/growth/config";

describe("growth tiers", () => {
  it("no tier below the first threshold", () => {
    expect(currentTier(0)).toBeNull();
    expect(nextTier(0)?.threshold).toBe(GROWTH_TIERS[0].threshold);
  });

  it("returns the highest tier whose threshold is met", () => {
    expect(currentTier(1)?.key).toBe("connector");
    expect(currentTier(3)?.key).toBe("insider");
    expect(currentTier(5)?.key).toBe("founder");
    expect(currentTier(100)?.key).toBe("founder"); // clamps to top tier
  });

  it("nextTier is the first unmet threshold, null at the top", () => {
    expect(nextTier(1)?.key).toBe("insider");
    expect(nextTier(3)?.key).toBe("founder");
    expect(nextTier(5)).toBeNull();
  });
});

describe("waitlist position", () => {
  it("climbs as qualified referrals grow and never drops below 1", () => {
    expect(waitlistPosition(0)).toBe(WAITLIST_BASE);
    expect(waitlistPosition(1)).toBe(WAITLIST_BASE - WAITLIST_STEP);
    expect(waitlistPosition(2)).toBe(WAITLIST_BASE - 2 * WAITLIST_STEP);
    // huge count clamps to 1, never negative
    expect(waitlistPosition(1_000_000)).toBe(1);
  });
});
