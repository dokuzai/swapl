// Hand-crafted postcards for the 10 seeded cities. Used both as the default
// for those cities and as few-shot examples when prompting the AI for unknown
// places.

import type { Postcard } from "./postcard-types";

export const PRESETS: Record<string, Postcard> = {
  Istanbul: {
    palette: "warm",
    sky: "dawn",
    ground: "water",
    elements: [
      { type: "bosphorus-bridge", x: 0.18, scale: 0.9 },
      { type: "hagia-sophia", x: 0.55, scale: 1.0 },
      { type: "galata-tower", x: 0.86, scale: 0.9 },
      { type: "sailboat", x: 0.78, scale: 0.9 },
    ],
    stamp: "Istanbul",
  },
  Amsterdam: {
    palette: "cool",
    sky: "day",
    ground: "water",
    elements: [
      { type: "windmill", x: 0.18, scale: 1.0 },
      { type: "canal-houses", x: 0.55, scale: 1.0 },
      { type: "tulip-row", x: 0.84, scale: 0.95 },
      { type: "sailboat", x: 0.32, scale: 0.7 },
    ],
    stamp: "Amsterdam",
  },
  Tokyo: {
    palette: "rose",
    sky: "dusk",
    ground: "street",
    elements: [
      { type: "mount-fuji", x: 0.22, scale: 1.0 },
      { type: "tokyo-tower", x: 0.55, scale: 1.05 },
      { type: "pagoda", x: 0.85, scale: 0.95 },
    ],
    stamp: "Tokyo",
  },
  Lisbon: {
    palette: "sand",
    sky: "day",
    ground: "street",
    elements: [
      { type: "april-25-bridge", x: 0.2, scale: 0.95 },
      { type: "rowhouse", x: 0.55, scale: 1.0 },
      { type: "azulejo-tower", x: 0.84, scale: 0.95 },
      { type: "tram-28", x: 0.32, scale: 0.85 },
    ],
    stamp: "Lisbon",
  },
  CDMX: {
    palette: "sage",
    sky: "day",
    ground: "street",
    elements: [
      { type: "step-pyramid", x: 0.18, scale: 1.0 },
      { type: "mexico-cathedral", x: 0.55, scale: 1.0 },
      { type: "agave", x: 0.86, scale: 1.0 },
    ],
    stamp: "CDMX",
  },
  Brooklyn: {
    palette: "dusk",
    sky: "dusk",
    ground: "water",
    elements: [
      { type: "manhattan-skyline", x: 0.32, scale: 1.0 },
      { type: "brooklyn-bridge", x: 0.55, scale: 1.05 },
      { type: "statue-of-liberty", x: 0.86, scale: 1.0 },
    ],
    stamp: "Brooklyn",
  },
  Paris: {
    palette: "sand",
    sky: "dawn",
    ground: "street",
    elements: [
      { type: "sacre-coeur", x: 0.22, scale: 0.95 },
      { type: "eiffel", x: 0.55, scale: 1.05 },
      { type: "arc-de-triomphe", x: 0.86, scale: 0.95 },
    ],
    stamp: "Paris",
  },
  Marrakesh: {
    palette: "warm",
    sky: "day",
    ground: "sand",
    elements: [
      { type: "palm", x: 0.14, scale: 1.0, flip: true },
      { type: "koutoubia", x: 0.55, scale: 1.0 },
      { type: "riad-arch", x: 0.85, scale: 0.95 },
      { type: "palm", x: 0.32, scale: 0.85 },
    ],
    stamp: "Marrakesh",
  },
  Berlin: {
    palette: "cool",
    sky: "day",
    ground: "street",
    elements: [
      { type: "reichstag-dome", x: 0.22, scale: 1.0 },
      { type: "brandenburger-tor", x: 0.55, scale: 1.0 },
      { type: "tv-tower", x: 0.86, scale: 1.05 },
    ],
    stamp: "Berlin",
  },
  Seoul: {
    palette: "rose",
    sky: "dawn",
    ground: "street",
    elements: [
      { type: "bukhansan", x: 0.5, scale: 1.0 },
      { type: "gyeongbokgung", x: 0.32, scale: 0.95 },
      { type: "namsan-tower", x: 0.78, scale: 1.0 },
    ],
    stamp: "Seoul",
  },
};

export function presetFor(city: string): Postcard | null {
  const exact = PRESETS[city];
  if (exact) return exact;
  // case-insensitive fallback
  const found = Object.keys(PRESETS).find((k) => k.toLowerCase() === city.toLowerCase());
  return found ? PRESETS[found] : null;
}
