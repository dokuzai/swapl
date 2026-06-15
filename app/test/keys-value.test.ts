// Keys value derivation (DOK-155): transparent, deterministic Keys-per-night.

import { describe, expect, it } from "vitest";
import {
  BASE_NIGHTLY_KEYS,
  MAX_NIGHTLY_KEYS,
  MIN_NIGHTLY_KEYS,
  cityTier,
  keysCostFor,
  nightlyKeysFor,
  nightsBetween,
} from "@/lib/keys/value";

describe("cityTier", () => {
  it("classifies known tier-1 / tier-2 cities case-insensitively", () => {
    expect(cityTier("Paris")).toBe(1);
    expect(cityTier("paris")).toBe(1);
    expect(cityTier("Lisbon")).toBe(2);
    expect(cityTier("Nowheresville")).toBe(3);
  });
});

describe("nightlyKeysFor", () => {
  it("prices a typical mid-size verified flat in a popular city around 10", () => {
    // base 4 + size(60→2) + sleeps(4→2) + tier2(2) + verified(2) = 12
    const v = nightlyKeysFor({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true });
    expect(v).toBe(12);
  });

  it("a small unverified place in a quiet city sits near the floor", () => {
    // base 4 + size(30→1) + sleeps(2→0) + tier3(0) + verified(0) = 5
    const v = nightlyKeysFor({ sizeSqm: 30, sleeps: 2, city: "Smalltown", isVerified: false });
    expect(v).toBe(5);
  });

  it("never goes below the floor", () => {
    const v = nightlyKeysFor({ sizeSqm: 0, sleeps: 0, city: "Smalltown", isVerified: false });
    expect(v).toBeGreaterThanOrEqual(MIN_NIGHTLY_KEYS);
    expect(v).toBe(BASE_NIGHTLY_KEYS); // base 4, all bonuses 0
  });

  it("clamps a huge verified home in a top city at the ceiling", () => {
    const v = nightlyKeysFor({ sizeSqm: 1000, sleeps: 20, city: "Tokyo", isVerified: true });
    expect(v).toBe(MAX_NIGHTLY_KEYS);
  });
});

describe("nightsBetween + keysCostFor", () => {
  it("counts whole nights (min 1) and multiplies by nightly", () => {
    const nights = nightsBetween(new Date("2026-07-01"), new Date("2026-07-08"));
    expect(nights).toBe(7);
    expect(keysCostFor(10, nights)).toBe(70);
  });
});
