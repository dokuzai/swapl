// Hand-crafted postcards for the seeded cities (and a handful of common
// add-ons). Used both as the default for those cities and as few-shot
// examples when prompting the AI for unknown places.
//
// Composition convention: 4–6 layered elements ordered back-to-front, with
// at least one background, one hero landmark, one supporting landmark, and
// one foreground detail (vehicle / palm / cherry-blossoms / boat).

import type { Postcard } from "./postcard-types";

export const PRESETS: Record<string, Postcard> = {
  Istanbul: {
    palette: "warm",
    sky: "dawn",
    ground: "water",
    weather: "clear",
    elements: [
      { type: "hill", x: 0.18, scale: 1.0 },
      { type: "bosphorus-bridge", x: 0.18, scale: 0.95 },
      { type: "hagia-sophia", x: 0.55, scale: 1.15 },
      { type: "galata-tower", x: 0.86, scale: 0.95 },
      { type: "sailboat", x: 0.78, scale: 0.85 },
      { type: "fishing-boat", x: 0.32, scale: 0.85 },
    ],
    stamp: "Istanbul",
    country: "Türkiye",
  },
  Amsterdam: {
    palette: "cool",
    sky: "day",
    ground: "water",
    weather: "cloudy",
    elements: [
      { type: "windmill", x: 0.18, scale: 1.0 },
      { type: "canal-houses", x: 0.55, scale: 1.05 },
      { type: "tulip-row", x: 0.84, scale: 0.95 },
      { type: "sailboat", x: 0.32, scale: 0.75 },
      { type: "bicycle-leaning", x: 0.7, scale: 0.85 },
    ],
    stamp: "Amsterdam",
    country: "Nederland",
  },
  Tokyo: {
    palette: "rose",
    sky: "dusk",
    ground: "street",
    weather: "clear",
    elements: [
      { type: "mount-fuji", x: 0.22, scale: 1.05 },
      { type: "tokyo-tower", x: 0.55, scale: 1.2 },
      { type: "pagoda", x: 0.85, scale: 1.0 },
      { type: "cherry-blossoms", x: 0.16, scale: 0.85 },
      { type: "bicycle-leaning", x: 0.72, scale: 0.8 },
    ],
    stamp: "Tokyo",
    country: "Nippon",
  },
  Lisbon: {
    palette: "sand",
    sky: "day",
    ground: "street",
    weather: "clear",
    elements: [
      { type: "april-25-bridge", x: 0.22, scale: 0.95 },
      { type: "rowhouse", x: 0.55, scale: 1.05 },
      { type: "azulejo-tower", x: 0.84, scale: 0.95 },
      { type: "trolley-cable-car", x: 0.32, scale: 0.85 },
      { type: "fishing-boat", x: 0.78, scale: 0.7 },
    ],
    stamp: "Lisboa",
    country: "Portugal",
  },
  CDMX: {
    palette: "sage",
    sky: "day",
    ground: "street",
    weather: "clear",
    elements: [
      { type: "hill", x: 0.18, scale: 1.0 },
      { type: "step-pyramid", x: 0.22, scale: 1.0 },
      { type: "mexico-cathedral", x: 0.55, scale: 1.1 },
      { type: "agave", x: 0.86, scale: 1.0 },
      { type: "vespa", x: 0.7, scale: 0.85 },
    ],
    stamp: "CDMX",
    country: "México",
  },
  Brooklyn: {
    palette: "dusk",
    sky: "dusk",
    ground: "water",
    weather: "clear",
    elements: [
      { type: "manhattan-skyline", x: 0.32, scale: 1.05 },
      { type: "brooklyn-bridge", x: 0.55, scale: 1.15 },
      { type: "statue-of-liberty", x: 0.86, scale: 1.0 },
      { type: "stoop-with-railings", x: 0.18, scale: 0.9 },
      { type: "fishing-boat", x: 0.74, scale: 0.7 },
    ],
    stamp: "Brooklyn",
    country: "USA",
  },
  Paris: {
    palette: "sand",
    sky: "dawn",
    ground: "street",
    weather: "clear",
    elements: [
      { type: "sacre-coeur", x: 0.22, scale: 1.0 },
      { type: "arc-de-triomphe", x: 0.84, scale: 0.95 },
      { type: "eiffel", x: 0.55, scale: 1.2 },
      { type: "vespa", x: 0.18, scale: 0.85 },
      { type: "plane-trail", x: 0.4, scale: 1.0 },
    ],
    stamp: "Paris",
    country: "France",
  },
  Marrakesh: {
    palette: "warm",
    sky: "day",
    ground: "sand",
    weather: "clear",
    elements: [
      { type: "egyptian-pyramid", x: 0.05, scale: 0.7 },
      { type: "koutoubia", x: 0.55, scale: 1.15 },
      { type: "riad-arch", x: 0.85, scale: 1.0 },
      { type: "palm", x: 0.18, scale: 1.0, flip: true },
      { type: "palm", x: 0.74, scale: 0.85 },
      { type: "hot-air-balloon", x: 0.35, scale: 1.0 },
    ],
    stamp: "Marrakesh",
    country: "Maghreb",
  },
  Berlin: {
    palette: "cool",
    sky: "day",
    ground: "street",
    weather: "cloudy",
    elements: [
      { type: "reichstag-dome", x: 0.22, scale: 1.05 },
      { type: "brandenburger-tor", x: 0.55, scale: 1.05 },
      { type: "tv-tower", x: 0.86, scale: 1.15 },
      { type: "bicycle-leaning", x: 0.7, scale: 0.85 },
    ],
    stamp: "Berlin",
    country: "Deutschland",
  },
  Seoul: {
    palette: "rose",
    sky: "dawn",
    ground: "street",
    weather: "misty",
    elements: [
      { type: "bukhansan", x: 0.5, scale: 1.05 },
      { type: "gyeongbokgung", x: 0.32, scale: 1.0 },
      { type: "namsan-tower", x: 0.78, scale: 1.05 },
      { type: "cherry-blossoms", x: 0.14, scale: 0.85 },
    ],
    stamp: "Seoul",
    country: "Hanguk",
  },

  // ----- Phase 2 add-ons (cover common pre-launch listing cities) -----

  Rome: {
    palette: "sand",
    sky: "dawn",
    ground: "street",
    weather: "clear",
    elements: [
      { type: "hill", x: 0.16, scale: 1.0 },
      { type: "fortress", x: 0.22, scale: 0.95 },
      { type: "duomo-dome", x: 0.55, scale: 1.15 },
      { type: "siena-tower", x: 0.84, scale: 1.05 },
      { type: "vespa", x: 0.18, scale: 0.85 },
    ],
    stamp: "Roma",
    country: "Italia",
  },
  Venice: {
    palette: "sand",
    sky: "dawn",
    ground: "water",
    weather: "misty",
    elements: [
      { type: "siena-tower", x: 0.22, scale: 1.0 },
      { type: "duomo-dome", x: 0.55, scale: 1.05 },
      { type: "bridge-arch", x: 0.84, scale: 1.0 },
      { type: "gondola", x: 0.3, scale: 1.0 },
      { type: "gondola", x: 0.72, scale: 0.85, flip: true },
    ],
    stamp: "Venezia",
    country: "Italia",
  },
  London: {
    palette: "cool",
    sky: "day",
    ground: "street",
    weather: "cloudy",
    elements: [
      { type: "tower-bridge", x: 0.22, scale: 1.0 },
      { type: "big-ben", x: 0.55, scale: 1.15 },
      { type: "london-eye", x: 0.84, scale: 1.0 },
      { type: "double-decker-bus", x: 0.34, scale: 0.85 },
    ],
    stamp: "London",
    country: "UK",
  },
  Sydney: {
    palette: "cool",
    sky: "day",
    ground: "water",
    weather: "cloudy",
    elements: [
      { type: "hill", x: 0.18, scale: 1.0 },
      { type: "bridge-arch", x: 0.22, scale: 1.05 },
      { type: "opera-house-sails", x: 0.55, scale: 1.2 },
      { type: "lighthouse", x: 0.86, scale: 0.95 },
      { type: "sailboat", x: 0.7, scale: 0.85 },
    ],
    stamp: "Sydney",
    country: "Australia",
  },
  Rio: {
    palette: "warm",
    sky: "dawn",
    ground: "water",
    weather: "clear",
    elements: [
      { type: "hill", x: 0.16, scale: 1.05 },
      { type: "christ-redeemer", x: 0.55, scale: 1.15 },
      { type: "palm-row", x: 0.84, scale: 1.0 },
      { type: "fishing-boat", x: 0.3, scale: 0.85 },
      { type: "palm", x: 0.18, scale: 0.95, flip: true },
    ],
    stamp: "Rio",
    country: "Brasil",
  },
  Cairo: {
    palette: "sand",
    sky: "day",
    ground: "sand",
    weather: "clear",
    elements: [
      { type: "egyptian-pyramid", x: 0.22, scale: 1.05 },
      { type: "egyptian-pyramid", x: 0.4, scale: 0.85 },
      { type: "minaret", x: 0.7, scale: 1.05 },
      { type: "palm", x: 0.84, scale: 0.95 },
      { type: "hot-air-balloon", x: 0.55, scale: 1.0 },
    ],
    stamp: "Cairo",
    country: "Egypt",
  },
  Singapore: {
    palette: "cool",
    sky: "dusk",
    ground: "water",
    weather: "clear",
    elements: [
      { type: "marina-bay-sands", x: 0.55, scale: 1.2 },
      { type: "skyscraper", x: 0.22, scale: 1.05 },
      { type: "shanghai-pearl", x: 0.84, scale: 1.0 },
      { type: "sailboat", x: 0.3, scale: 0.8 },
      { type: "palm", x: 0.78, scale: 0.85 },
    ],
    stamp: "Singapore",
    country: "Singapore",
  },
  "San Francisco": {
    palette: "warm",
    sky: "dawn",
    ground: "water",
    weather: "misty",
    elements: [
      { type: "hill", x: 0.18, scale: 1.0 },
      { type: "golden-gate-bridge", x: 0.5, scale: 1.15 },
      { type: "skyscraper", x: 0.86, scale: 1.05 },
      { type: "trolley-cable-car", x: 0.22, scale: 0.85 },
      { type: "fishing-boat", x: 0.74, scale: 0.8 },
    ],
    stamp: "San Francisco",
    country: "USA",
  },
};

export function presetFor(city: string): Postcard | null {
  const exact = PRESETS[city];
  if (exact) return exact;
  // case-insensitive fallback
  const found = Object.keys(PRESETS).find((k) => k.toLowerCase() === city.toLowerCase());
  return found ? PRESETS[found] : null;
}
