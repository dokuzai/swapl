"use client";

import dynamic from "next/dynamic";
import type { ListingDTO } from "@/lib/listing-utils";

// Leaflet touches `window` at import time, so the map must only render in the browser.
const Inner = dynamic(() => import("./listings-map-client"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-2xl border grid place-items-center text-sm"
      style={{ height: "70vh", borderColor: "var(--line)", background: "var(--cream-2)", color: "var(--navy-3)" }}
    >
      Loading map…
    </div>
  ),
});

export function ListingsMap({ listings }: { listings: ListingDTO[] }) {
  return (
    <Inner
      listings={listings.map((l) => ({
        id: l.id,
        city: l.city,
        neighbourhood: l.neighbourhood,
        title: l.title,
        sizeSqm: l.sizeSqm,
        sleeps: l.sleeps,
        palette: l.palette,
        lat: l.lat,
        lng: l.lng,
      }))}
    />
  );
}
