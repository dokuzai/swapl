"use client";

// Invisible client component mounted on the listing detail page (DOK-150).
// Records the visit into localStorage so the "Recently viewed" shelf on
// /listings can render without any new API endpoint.

import { useEffect } from "react";
import { recordRecentlyViewed, type RecentlyViewedEntry } from "@/lib/recently-viewed";

export function RecentlyViewedTracker({ entry }: { entry: Omit<RecentlyViewedEntry, "ts"> }) {
  useEffect(() => {
    recordRecentlyViewed(entry);
    // Re-record only when the listing changes, not on every prop identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  return null;
}
