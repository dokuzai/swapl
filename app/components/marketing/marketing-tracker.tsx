"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { attributionFromSearchParams, trackMarketingEvent } from "@/lib/marketing/attribution";

export function MarketingTracker({ pageType }: { pageType: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trackedKey = useRef<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    const key = `${pathname}?${query}`;
    if (trackedKey.current === key) return;
    trackedKey.current = key;
    trackMarketingEvent("page_view", {
      ...attributionFromSearchParams(searchParams, pathname),
      metadata: { pageType },
    });
  }, [pageType, pathname, searchParams]);

  return null;
}
