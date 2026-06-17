"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/client";

// Leaflet touches `window` at import time, so the map only renders in the browser.
const Inner = dynamic(() => import("./listing-location-map-client"), {
  ssr: false,
  loading: () => (
    <div
      className="grid place-items-center text-sm h-full"
      style={{ background: "var(--cream-2)", color: "var(--navy-3)" }}
    >
      …
    </div>
  ),
});

// Approximate-area map for a single listing's detail page. Shows the fuzzed
// location as a soft circle with a caption, never a precise pin.
export function ListingLocationMap({
  lat,
  lng,
  neighbourhood,
  city,
}: {
  lat: number;
  lng: number;
  neighbourhood: string;
  city: string;
}) {
  const t = useT();
  return (
    <div>
      <div
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: "var(--line)", height: "260px" }}
      >
        <Inner lat={lat} lng={lng} />
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--navy-3)" }}>
        {neighbourhood}, {city} · {t("listing.map.approxArea")}
      </p>
    </div>
  );
}
