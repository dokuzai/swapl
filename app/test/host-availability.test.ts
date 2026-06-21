// subtractRanges (DOK-219) — the interval math behind closed-by-default
// availability: closing a window except the open ranges, and opening a span out
// of a block. Half-open [from, to) semantics; zero-length remainders dropped.

import { describe, expect, it } from "vitest";
import { subtractRanges, type DateRange } from "@/lib/listing/availability";

const d = (s: string) => new Date(s + "T00:00:00.000Z");
const r = (from: string, to: string): DateRange => ({ dateFrom: d(from), dateTo: d(to) });
const show = (ranges: DateRange[]) =>
  ranges.map((x) => `${x.dateFrom.toISOString().slice(0, 10)}..${x.dateTo.toISOString().slice(0, 10)}`);

describe("subtractRanges", () => {
  const base = r("2026-01-01", "2026-02-01");

  it("returns the whole base when there are no cuts", () => {
    expect(show(subtractRanges(base, []))).toEqual(["2026-01-01..2026-02-01"]);
  });

  it("returns nothing when a cut covers the base", () => {
    expect(subtractRanges(base, [r("2025-12-01", "2026-03-01")])).toEqual([]);
  });

  it("splits into two when the cut is in the middle (open a week mid-window)", () => {
    expect(show(subtractRanges(base, [r("2026-01-10", "2026-01-17")]))).toEqual([
      "2026-01-01..2026-01-10",
      "2026-01-17..2026-02-01",
    ]);
  });

  it("trims the left edge", () => {
    expect(show(subtractRanges(base, [r("2025-12-20", "2026-01-10")]))).toEqual(["2026-01-10..2026-02-01"]);
  });

  it("trims the right edge", () => {
    expect(show(subtractRanges(base, [r("2026-01-20", "2026-02-15")]))).toEqual(["2026-01-01..2026-01-20"]);
  });

  it("ignores a non-overlapping cut", () => {
    expect(show(subtractRanges(base, [r("2026-03-01", "2026-03-10")]))).toEqual(["2026-01-01..2026-02-01"]);
  });

  it("applies multiple cuts (two opened spans leave three closed gaps)", () => {
    expect(
      show(subtractRanges(base, [r("2026-01-05", "2026-01-08"), r("2026-01-20", "2026-01-25")])),
    ).toEqual([
      "2026-01-01..2026-01-05",
      "2026-01-08..2026-01-20",
      "2026-01-25..2026-02-01",
    ]);
  });

  it("drops a zero-length remainder when a cut touches an edge exactly", () => {
    expect(show(subtractRanges(base, [r("2026-01-01", "2026-01-10")]))).toEqual(["2026-01-10..2026-02-01"]);
  });
});
