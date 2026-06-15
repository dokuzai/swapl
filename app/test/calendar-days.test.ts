import { describe, expect, it } from "vitest";
import {
  type CalendarSnapshot,
  dayStatus,
  monthGrid,
  rangeHasUnavailable,
  utcDay,
} from "@/lib/listing/calendar-days";

// Fixed "today" so status maths is deterministic regardless of wall clock.
const TODAY = utcDay(2026, 5, 15); // 2026-06-15

const snap: CalendarSnapshot = {
  availableFrom: "2026-06-01",
  availableTo: "2026-09-01", // checkout day — exclusive
  bookedRanges: [
    { dateFrom: "2026-06-20", dateTo: "2026-06-23", source: "agreement" }, // 20,21,22 booked
    { dateFrom: "2026-07-10", dateTo: "2026-07-12", source: "blocked" }, // 10,11 blocked
    { dateFrom: "2026-08-05", dateTo: "2026-08-07", source: "keys_stay" }, // 5,6 booked
  ],
};

describe("dayStatus", () => {
  it("marks days before today as past", () => {
    expect(dayStatus(utcDay(2026, 5, 10), snap, TODAY)).toBe("past");
  });

  it("marks days outside the published window", () => {
    // Before window start (but not past) — pick a window starting in the future.
    const future: CalendarSnapshot = { ...snap, availableFrom: "2026-06-25" };
    expect(dayStatus(utcDay(2026, 5, 20), future, TODAY)).toBe("outside");
    // availableTo is exclusive: the checkout day itself is outside.
    expect(dayStatus(utcDay(2026, 8, 1), snap, TODAY)).toBe("outside");
  });

  it("returns available for a free in-window day", () => {
    expect(dayStatus(utcDay(2026, 5, 25), snap, TODAY)).toBe("available");
  });

  it("returns booked for agreement / keys-stay nights (half-open)", () => {
    expect(dayStatus(utcDay(2026, 5, 20), snap, TODAY)).toBe("booked");
    expect(dayStatus(utcDay(2026, 5, 22), snap, TODAY)).toBe("booked");
    // Checkout day frees up.
    expect(dayStatus(utcDay(2026, 5, 23), snap, TODAY)).toBe("available");
    expect(dayStatus(utcDay(2026, 7, 5), snap, TODAY)).toBe("booked");
  });

  it("returns blocked for host blocks", () => {
    expect(dayStatus(utcDay(2026, 6, 10), snap, TODAY)).toBe("blocked");
    expect(dayStatus(utcDay(2026, 6, 11), snap, TODAY)).toBe("blocked");
    expect(dayStatus(utcDay(2026, 6, 12), snap, TODAY)).toBe("available");
  });

  it("treats source-less ranges (lighter picker shape) as booked", () => {
    const lite: CalendarSnapshot = {
      availableFrom: "2026-06-01",
      availableTo: "2026-09-01",
      bookedRanges: [{ dateFrom: "2026-06-25", dateTo: "2026-06-27" }],
    };
    expect(dayStatus(utcDay(2026, 5, 25), lite, TODAY)).toBe("booked");
  });
});

describe("rangeHasUnavailable", () => {
  it("is false for a fully free range", () => {
    expect(rangeHasUnavailable("2026-06-25", "2026-06-28", snap, TODAY)).toBe(false);
  });

  it("is true when the range spans a booked night", () => {
    expect(rangeHasUnavailable("2026-06-19", "2026-06-21", snap, TODAY)).toBe(true);
  });

  it("is true when the range spans a blocked night", () => {
    expect(rangeHasUnavailable("2026-07-09", "2026-07-11", snap, TODAY)).toBe(true);
  });

  it("excludes the checkout day (half-open)", () => {
    // Ends on the first booked day as checkout — that night isn't occupied.
    expect(rangeHasUnavailable("2026-06-17", "2026-06-20", snap, TODAY)).toBe(false);
  });
});

describe("monthGrid", () => {
  it("returns 42 cells, Monday-first, flagging in-month days", () => {
    const cells = monthGrid(2026, 5); // June 2026 starts on a Monday
    expect(cells).toHaveLength(42);
    expect(cells[0].date.getUTCDate()).toBe(1);
    expect(cells[0].inMonth).toBe(true);
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30); // June has 30 days
  });
});
