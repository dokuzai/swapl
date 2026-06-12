// Client-side "recently viewed" tracking (DOK-150). A compact snapshot of
// each visited listing detail goes into localStorage — id + display fields —
// so the browse shelf can render cards without any new API endpoint (zero
// API-contract changes). Newest first, deduped by id, capped at 12.

export type RecentlyViewedEntry = {
  id: string;
  title: string;
  city: string;
  country: string;
  neighbourhood: string;
  photo: string | null;
  ts: number;
};

const KEY = "swapl.recentlyViewed.v1";
export const RECENTLY_VIEWED_MAX = 12;

function isEntry(x: unknown): x is RecentlyViewedEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.title === "string" &&
    typeof e.city === "string" &&
    typeof e.country === "string" &&
    typeof e.neighbourhood === "string" &&
    (typeof e.photo === "string" || e.photo === null) &&
    typeof e.ts === "number"
  );
}

/** Read the list, newest first. Safe on the server (returns []). */
export function readRecentlyViewed(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, RECENTLY_VIEWED_MAX);
  } catch {
    return [];
  }
}

/** Record a visit: dedupe by id, prepend, cap. No-op outside the browser. */
export function recordRecentlyViewed(entry: Omit<RecentlyViewedEntry, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const next: RecentlyViewedEntry[] = [
      { ...entry, ts: Date.now() },
      ...readRecentlyViewed().filter((e) => e.id !== entry.id),
    ].slice(0, RECENTLY_VIEWED_MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full / disabled — tracking is best-effort.
  }
}
