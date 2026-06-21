// Keys value derivation (DOK-155): transparent, deterministic Keys-per-night.

import { describe, expect, it } from "vitest";
import {
  MAX_NIGHTLY_KEYS,
  MIN_CAPACITY_KEYS,
  capacityNightlyKeys,
  keysCostFor,
  nightlyKeysFor,
  nightsBetween,
} from "@/lib/keys/value";

// DOK-219: a home's nightly Keys value is its guest capacity (sleeps). One night
// hosting an N-capacity home is worth N Keys; the old size/location/verified/AI
// factors no longer apply.
describe("nightlyKeysFor (capacity-based)", () => {
  it("equals the home's capacity regardless of size, city, or verification", () => {
    expect(nightlyKeysFor({ sizeSqm: 60, sleeps: 4, city: "Lisbon", isVerified: true })).toBe(4);
    expect(nightlyKeysFor({ sizeSqm: 200, sleeps: 4, city: "Tokyo", isVerified: true })).toBe(4);
    expect(nightlyKeysFor({ sizeSqm: 30, sleeps: 2, city: "Smalltown", isVerified: false })).toBe(2);
  });

  it("ignores any persisted base/adjustment (capacity wins immediately)", () => {
    const v = nightlyKeysFor({
      sizeSqm: 60, sleeps: 3, city: "Roma", isVerified: false,
      nightlyKeysBase: 18, nightlyKeysAdjustment: 0.2,
    });
    expect(v).toBe(3);
  });

  it("a solo place is worth the floor of 1; capacity is clamped to the ceiling", () => {
    expect(nightlyKeysFor({ sizeSqm: 18, sleeps: 1, city: "Smalltown", isVerified: false })).toBe(MIN_CAPACITY_KEYS);
    expect(capacityNightlyKeys(0)).toBe(MIN_CAPACITY_KEYS);
    expect(capacityNightlyKeys(99)).toBe(MAX_NIGHTLY_KEYS);
  });
});

describe("capacity-nights symmetry (DOK-219)", () => {
  it("7 guests for 1 night earns 7 Keys → 7 nights alone in a 1-capacity place", () => {
    const earned = keysCostFor(capacityNightlyKeys(7), 1); // host a 7-sleeps home, 1 night
    expect(earned).toBe(7);
    const soloStay = keysCostFor(capacityNightlyKeys(1), 7); // stay alone, 7 nights
    expect(soloStay).toBe(7);
  });
});

describe("nightsBetween + keysCostFor", () => {
  it("counts whole nights (min 1) and multiplies by nightly", () => {
    const nights = nightsBetween(new Date("2026-07-01"), new Date("2026-07-08"));
    expect(nights).toBe(7);
    expect(keysCostFor(10, nights)).toBe(70);
  });
});
