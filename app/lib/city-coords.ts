// Approximate centroids for the cities we ship illustrations for, plus a
// small lookup for cities Claude has invented illustrations for. New entries
// can be added at runtime when the AI generator runs against an unknown city.

export type Coord = { lat: number; lng: number };

const STATIC_COORDS: Record<string, Coord> = {
  Istanbul: { lat: 41.015, lng: 28.979 },
  Amsterdam: { lat: 52.370, lng: 4.895 },
  Tokyo: { lat: 35.682, lng: 139.759 },
  Lisbon: { lat: 38.722, lng: -9.139 },
  CDMX: { lat: 19.433, lng: -99.133 },
  Brooklyn: { lat: 40.678, lng: -73.944 },
  Paris: { lat: 48.857, lng: 2.352 },
  Marrakesh: { lat: 31.629, lng: -7.989 },
  Berlin: { lat: 52.520, lng: 13.405 },
  Seoul: { lat: 37.566, lng: 126.978 },
};

export function coordForCity(city: string): Coord | null {
  return STATIC_COORDS[city] ?? null;
}

// Deterministic small jitter so listings in the same city don't all stack on one pin.
export function jitterCoord(base: Coord, key: string, radiusDeg = 0.025): Coord {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const r = (((h >>> 16) & 0xffff) / 0xffff) * radiusDeg;
  return { lat: base.lat + Math.sin(a) * r, lng: base.lng + Math.cos(a) * r };
}
