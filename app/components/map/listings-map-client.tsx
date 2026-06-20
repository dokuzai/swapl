"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ListingDTO } from "@/lib/listing-utils";
import { useT } from "@/lib/i18n/client";

// Build a small SVG pin once per palette so each city's pin matches its
// illustration palette — keeps the visual language consistent.
const PALETTE_HEX: Record<string, string> = {
  warm: "#C2410C",
  cool: "#1E40AF",
  rose: "#BE185D",
  sage: "#047857",
  dusk: "#4338CA",
  sand: "#92400E",
  mono: "#1A1F3C",
};
const PINK = "#F24B8E";

function svgIcon(color: string) {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" width="32" height="44">
  <path d="M16 1 C 7 1 3 7 3 14 C 3 23 16 42 16 42 C 16 42 29 23 29 14 C 29 7 25 1 16 1 Z" fill="${color}" stroke="#1A1F3C" stroke-width="1.5"/>
  <circle cx="16" cy="14" r="5.5" fill="#FFFFFF"/>
</svg>`;
  return L.divIcon({
    className: "swapl-pin",
    html: svg,
    iconSize: [32, 44],
    iconAnchor: [16, 42],
    popupAnchor: [0, -36],
  });
}

function FitBounds({ pts }: { pts: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    const bounds = L.latLngBounds(pts as L.LatLngBoundsLiteral);
    map.fitBounds(bounds.pad(0.18), { animate: false });
  }, [map, pts]);
  return null;
}

type MapEmptyState = {
  title: string;
  body: string;
  resetHref: string;
  resetLabel: string;
};

export default function ListingsMapClient({
  listings,
  empty,
  centeredCity,
}: {
  listings: Array<Pick<ListingDTO, "id" | "city" | "neighbourhood" | "lat" | "lng" | "palette" | "sizeSqm" | "sleeps" | "title">>;
  empty?: MapEmptyState;
  centeredCity?: string | null;
}) {
  const t = useT();
  const points = useMemo(
    () =>
      listings
        .filter((l): l is typeof l & { lat: number; lng: number } => l.lat !== null && l.lng !== null)
        .map((l) => ({ ...l, color: PALETTE_HEX[l.palette] ?? PINK })),
    [listings]
  );
  // Prefer centering on the filtered city's first pin; fall back to the first
  // pin, then to a world view when there are no results at all (DOK-216).
  const center: [number, number] = useMemo(() => {
    if (centeredCity) {
      const match = points.find((p) => p.city.toLowerCase() === centeredCity.toLowerCase());
      if (match) return [match.lat, match.lng];
    }
    return points.length ? [points[0].lat, points[0].lng] : [25, 10];
  }, [points, centeredCity]);
  const hasResults = points.length > 0;

  return (
    <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: "var(--line)", height: "70vh" }}>
      <MapContainer
        center={center}
        zoom={hasResults ? 2 : 3}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", background: "var(--cream-2)" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · tiles by <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={svgIcon(p.color)}>
            <Popup>
              <div style={{ fontFamily: "var(--font-body)", minWidth: 180 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500 }}>
                  {p.neighbourhood} · {p.city}
                </div>
                <div style={{ fontSize: 12, color: "#5E63A0", marginTop: 2 }}>
                  {t("listing.sizeSleeps", { size: p.sizeSqm, sleeps: p.sleeps })}
                </div>
                <Link
                  href={`/listings/${p.id}`}
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    padding: "4px 10px",
                    background: PINK,
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {t("map.openListing")}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds pts={points.map((p) => [p.lat, p.lng])} />
      </MapContainer>
      {!hasResults && empty && (
        <div className="absolute inset-0 z-[1000] grid place-items-center p-6" style={{ background: "rgba(255,255,255,0.55)" }}>
          <div className="surface-card max-w-sm p-6 text-center" style={{ pointerEvents: "auto" }}>
            <h2 className="font-display text-xl mb-2">{empty.title}</h2>
            <p className="mb-4 text-sm" style={{ color: "var(--navy-2)" }}>
              {empty.body}
            </p>
            <Link href={empty.resetHref} className="pill-primary">
              {empty.resetLabel}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
