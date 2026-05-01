import type { Palette } from "@/components/illustrations";

export type CityMeta = {
  name: string;
  country: string;
  palette: Palette;
};

export const CITIES: CityMeta[] = [
  { name: "Istanbul", country: "Türkiye", palette: "warm" },
  { name: "Amsterdam", country: "Netherlands", palette: "cool" },
  { name: "Tokyo", country: "Japan", palette: "rose" },
  { name: "Lisbon", country: "Portugal", palette: "sand" },
  { name: "CDMX", country: "Mexico", palette: "sage" },
  { name: "Brooklyn", country: "USA", palette: "dusk" },
  { name: "Paris", country: "France", palette: "sand" },
  { name: "Marrakesh", country: "Morocco", palette: "warm" },
  { name: "Berlin", country: "Germany", palette: "cool" },
  { name: "Seoul", country: "South Korea", palette: "rose" },
];

const cityIndex = new Map(CITIES.map((c) => [c.name, c]));

export function paletteForCity(city: string): Palette {
  return cityIndex.get(city)?.palette ?? "warm";
}

export function metaForCity(city: string): CityMeta | undefined {
  return cityIndex.get(city);
}
