// Pure unit tests for the trip-phase derivation + reveal gating + home-guide
// completeness helpers (lib/trip/phase.ts). No I/O, no mocks.

import { describe, expect, it } from "vitest";
import {
  getTripPhase,
  guideUnlocked,
  revealUnlocksAt,
  homeGuideCompleteness,
  homeGuideComplete,
  homeGuideFilledCount,
  HOME_GUIDE_CORE_FIELDS,
  REVEAL_WINDOW_MS,
} from "@/lib/trip/phase";

const NOW = new Date("2026-06-14T12:00:00Z");
const hours = (n: number) => n * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

function agreement(over: Partial<{ status: string; dateFrom: Date; createdAt: Date }> = {}) {
  return {
    status: "ACTIVE",
    dateFrom: at(hours(72)), // 3 days out by default
    createdAt: at(-hours(72)),
    ...over,
  };
}

describe("getTripPhase", () => {
  it("INTERRUPTED short-circuits regardless of dates/events", () => {
    expect(getTripPhase(agreement({ status: "INTERRUPTED", dateFrom: at(-hours(1)) }), [{ type: "checkin", userId: "u" }], NOW)).toBe("INTERRUPTED");
  });

  it("COMPLETED short-circuits", () => {
    expect(getTripPhase(agreement({ status: "COMPLETED" }), [], NOW)).toBe("COMPLETED");
  });

  it("IN_PROGRESS once the stay has started and a party has checked in", () => {
    const a = agreement({ dateFrom: at(-hours(2)) });
    expect(getTripPhase(a, [{ type: "checkin", userId: "u1" }], NOW)).toBe("IN_PROGRESS");
  });

  it("not IN_PROGRESS before dateFrom even with a check-in", () => {
    const a = agreement({ dateFrom: at(hours(2)) }); // within 48h -> READY
    expect(getTripPhase(a, [{ type: "checkin", userId: "u1" }], NOW)).toBe("READY");
  });

  it("READY inside the 48h reveal window", () => {
    expect(getTripPhase(agreement({ dateFrom: at(hours(40)) }), [], NOW)).toBe("READY");
  });

  it("AGREED when freshly accepted (<24h) and far from the stay", () => {
    expect(getTripPhase(agreement({ dateFrom: at(hours(240)), createdAt: at(-hours(3)) }), [], NOW)).toBe("AGREED");
  });

  it("PREPARING when accepted long ago but still outside the reveal window", () => {
    expect(getTripPhase(agreement({ dateFrom: at(hours(240)), createdAt: at(-hours(48)) }), [], NOW)).toBe("PREPARING");
  });
});

describe("guideUnlocked", () => {
  it("locked well before the 48h window", () => {
    expect(guideUnlocked({ status: "ACTIVE", dateFrom: at(hours(72)) }, NOW, false)).toBe(false);
  });

  it("unlocks exactly at dateFrom - 48h", () => {
    const a = { status: "ACTIVE", dateFrom: new Date(NOW.getTime() + REVEAL_WINDOW_MS) };
    expect(guideUnlocked(a, NOW, false)).toBe(true);
  });

  it("unlocks early when both guides are complete", () => {
    expect(guideUnlocked({ status: "ACTIVE", dateFrom: at(hours(240)) }, NOW, true)).toBe(true);
  });

  it("never unlocks for an interrupted swap, even with both guides complete", () => {
    expect(guideUnlocked({ status: "INTERRUPTED", dateFrom: at(hours(1)) }, NOW, true)).toBe(false);
  });

  it("revealUnlocksAt is dateFrom minus the window", () => {
    const a = { dateFrom: at(hours(72)) };
    expect(revealUnlocksAt(a).getTime()).toBe(a.dateFrom.getTime() - REVEAL_WINDOW_MS);
  });
});

describe("home guide completeness", () => {
  const fullCore = Object.fromEntries(HOME_GUIDE_CORE_FIELDS.map((f) => [f, "x"]));

  it("empty guide is 0%", () => {
    expect(homeGuideCompleteness(null)).toBe(0);
    expect(homeGuideFilledCount({})).toBe(0);
    expect(homeGuideComplete({})).toBe(false);
  });

  it("all core fields filled is 100% and complete", () => {
    expect(homeGuideCompleteness(fullCore)).toBe(100);
    expect(homeGuideComplete(fullCore)).toBe(true);
  });

  it("blank-string and null fields don't count", () => {
    expect(homeGuideFilledCount({ accessInstructions: "  ", keyPickup: null, wifiName: "code" })).toBe(1);
  });

  it("partial core fields round to a percentage; non-core fields are ignored", () => {
    const half = { accessInstructions: "a", keyPickup: "b", wifiName: "c", wifiPassword: "d", houseRules: "ignored" };
    // 4 of 8 core fields
    expect(homeGuideCompleteness(half)).toBe(50);
  });
});
