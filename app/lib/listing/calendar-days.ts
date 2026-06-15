// Client-side calendar day maths (DOK-159).
//
// THE single helper that turns a listing's availability snapshot (the
// /calendar response: window + occupied/blocked ranges, all half-open
// [from, to) ISO strings) into a per-day status the month grid can colour.
// Both the host calendar editor and the browse/Stay-with-Keys date pickers
// read from here so "what colour is this day" lives in exactly one place.

export type DayStatus =
  | "past" // before today — never selectable
  | "outside" // outside the listing's published window
  | "available" // free to book
  | "booked" // taken by a swap agreement or Keys stay
  | "blocked"; // host-defined manual block

export type CalendarRange = {
  dateFrom: string;
  dateTo: string;
  // Present on the /calendar response; absent on Stay-with-Keys' lighter shape.
  source?: "agreement" | "keys_stay" | "blocked";
};

export type CalendarSnapshot = {
  availableFrom: string;
  availableTo: string;
  bookedRanges: CalendarRange[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight for a Y/M/D — calendars reason in whole days, TZ-free. */
export function utcDay(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

/** Parse an ISO string to its UTC-midnight day boundary. */
export function dayKey(iso: string | Date): Date {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** "2026-06-15" for a Date, using UTC so the grid never drifts a day. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today at UTC midnight — the floor for "past". */
export function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Half-open membership: is `day` inside [from, to)? */
function inRange(day: Date, from: Date, to: Date): boolean {
  return day.getTime() >= from.getTime() && day.getTime() < to.getTime();
}

/**
 * Status of a single calendar day for a listing. `today` is injectable so the
 * grid can compute a whole month against one fixed reference (and tests stay
 * deterministic). Past wins over everything; then window membership; then
 * blocked vs booked vs free. A range whose source is "blocked" (or any range
 * supplied to a picker that doesn't carry sources) marks the day blocked when
 * it is the only reason, otherwise booked.
 */
export function dayStatus(day: Date, snap: CalendarSnapshot, today: Date = todayUTC()): DayStatus {
  if (day.getTime() < today.getTime()) return "past";

  const from = dayKey(snap.availableFrom);
  const to = dayKey(snap.availableTo);
  // The window is half-open: availableTo is the checkout day, not bookable.
  if (day.getTime() < from.getTime() || day.getTime() >= to.getTime()) return "outside";

  let blocked = false;
  let booked = false;
  for (const r of snap.bookedRanges) {
    if (!inRange(day, dayKey(r.dateFrom), dayKey(r.dateTo))) continue;
    if (r.source === "blocked") blocked = true;
    else booked = true;
  }
  if (booked) return "booked";
  if (blocked) return "blocked";
  return "available";
}

/** Is a day selectable in a picker? Only genuinely free days inside the window. */
export function isSelectable(status: DayStatus): boolean {
  return status === "available";
}

/**
 * The 6-week (42-cell) grid for a month, Monday-first. Each cell is a Date at
 * UTC midnight; cells outside the target month are flagged so the grid can dim
 * them. weekStart 1 = Monday (EU default across the 8 locales we ship).
 */
export function monthGrid(year: number, monthIndex: number): Array<{ date: Date; inMonth: boolean }> {
  const first = utcDay(year, monthIndex, 1);
  // JS getUTCDay: 0=Sun..6=Sat. Shift so Monday=0.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - lead * DAY_MS);
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    cells.push({ date, inMonth: date.getUTCMonth() === monthIndex });
  }
  return cells;
}

/** Whole days in [from, to) — nights for a stay range. */
export function nightsBetweenISO(fromISO: string, toISO: string): number {
  const a = dayKey(fromISO).getTime();
  const b = dayKey(toISO).getTime();
  if (b <= a) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** Does any selectable-range [from, to) overlap an unavailable day? */
export function rangeHasUnavailable(
  fromISO: string,
  toISO: string,
  snap: CalendarSnapshot,
  today: Date = todayUTC(),
): boolean {
  let cur = dayKey(fromISO);
  const end = dayKey(toISO); // checkout day excluded
  while (cur.getTime() < end.getTime()) {
    if (!isSelectable(dayStatus(cur, snap, today))) return true;
    cur = new Date(cur.getTime() + DAY_MS);
  }
  return false;
}
