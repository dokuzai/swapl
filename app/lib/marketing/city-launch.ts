import type { Palette } from "@/components/illustrations";

export type CityLaunchPage = {
  slug: string;
  city: string;
  country: string;
  palette: Palette;
  neighborhoods: string[];
  demandFrom: string[];
  angle: string;
  proof: string[];
};

export const CITY_LAUNCH_PAGES: CityLaunchPage[] = [
  {
    slug: "istanbul-home-swap",
    city: "Istanbul",
    country: "Turkiye",
    palette: "warm",
    neighborhoods: ["Cihangir", "Moda", "Bomonti", "Galata"],
    demandFrom: ["Amsterdam", "Berlin", "Lisbon", "London"],
    angle: "Founding supply for one of the first September swap corridors.",
    proof: ["Bosphorus-view homes", "Walkable neighborhoods", "Strong Europe demand"],
  },
  {
    slug: "amsterdam-home-swap",
    city: "Amsterdam",
    country: "Netherlands",
    palette: "cool",
    neighborhoods: ["Jordaan", "De Pijp", "Oost", "Noord"],
    demandFrom: ["Istanbul", "Paris", "Brooklyn", "Tokyo"],
    angle: "A high-demand European anchor for early reciprocal swaps.",
    proof: ["Canal homes", "Bike-friendly stays", "Dense city demand"],
  },
  {
    slug: "lisbon-home-swap",
    city: "Lisbon",
    country: "Portugal",
    palette: "sand",
    neighborhoods: ["Alfama", "Principe Real", "Santos", "Graca"],
    demandFrom: ["CDMX", "Berlin", "Istanbul", "Seoul"],
    angle: "A September travel-window city with broad remote-work demand.",
    proof: ["Long-stay demand", "Rooftop apartments", "Europe and LATAM pull"],
  },
  {
    slug: "brooklyn-home-swap",
    city: "Brooklyn",
    country: "USA",
    palette: "dusk",
    neighborhoods: ["Fort Greene", "Williamsburg", "Park Slope", "Clinton Hill"],
    demandFrom: ["Paris", "Amsterdam", "CDMX", "Tokyo"],
    angle: "A long-haul anchor for hosts who want real neighborhood stays.",
    proof: ["Brownstones", "Family-sized homes", "Long-haul demand"],
  },
  {
    slug: "tokyo-home-swap",
    city: "Tokyo",
    country: "Japan",
    palette: "rose",
    neighborhoods: ["Shimokitazawa", "Nakameguro", "Kichijoji", "Yanaka"],
    demandFrom: ["Lisbon", "Amsterdam", "Brooklyn", "Seoul"],
    angle: "A compact-home, high-intent city for carefully matched swaps.",
    proof: ["Quiet apartments", "Transit-rich stays", "Asia-Europe demand"],
  },
  {
    slug: "cdmx-home-swap",
    city: "CDMX",
    country: "Mexico",
    palette: "sage",
    neighborhoods: ["Roma Norte", "Condesa", "Juarez", "Coyoacan"],
    demandFrom: ["Brooklyn", "Lisbon", "Paris", "Berlin"],
    angle: "A creative-city corridor where longer stays and flexible dates matter.",
    proof: ["Art-deco apartments", "Remote-work demand", "Americas-Europe pull"],
  },
];

export function getCityLaunchPage(slug: string) {
  return CITY_LAUNCH_PAGES.find((page) => page.slug === slug) ?? null;
}
