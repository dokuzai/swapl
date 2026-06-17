"use client";

import { MapContainer, TileLayer, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const PINK = "#F24B8E";

// Single-listing location preview. The coordinate is already fuzzed to a ~2km
// area server-side (privacy), so we draw a soft circle rather than a precise
// pin and lock interaction down to a static preview.
export default function ListingLocationMapClient({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      zoomControl={false}
      attributionControl={false}
      style={{ height: "100%", width: "100%", background: "var(--cream-2)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · tiles by <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Circle
        center={[lat, lng]}
        radius={1500}
        pathOptions={{ color: PINK, weight: 1.5, fillColor: PINK, fillOpacity: 0.14 }}
      />
    </MapContainer>
  );
}
