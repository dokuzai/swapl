// Static city guides bundled with the build. Each guide is a structured
// document the /guides/[city] route renders inside the swapl chrome.

import istanbul from "./istanbul.json";
import amsterdam from "./amsterdam.json";
import tokyo from "./tokyo.json";
import lisbon from "./lisbon.json";
import brooklyn from "./brooklyn.json";
import cdmx from "./cdmx.json";

export type CityGuideSection = {
  kind: "neighbourhoods" | "transport" | "food" | "emergencies" | "etiquette";
  title: string;
  body: string; // markdown-light, line breaks preserved
};

export type CityGuide = {
  city: string;
  country: string;
  hero: string;
  sections: CityGuideSection[];
};

export const CITY_GUIDES: Record<string, CityGuide> = {
  istanbul: istanbul as CityGuide,
  amsterdam: amsterdam as CityGuide,
  tokyo: tokyo as CityGuide,
  lisbon: lisbon as CityGuide,
  brooklyn: brooklyn as CityGuide,
  cdmx: cdmx as CityGuide,
};

export function getCityGuide(slug: string): CityGuide | null {
  return CITY_GUIDES[slug.toLowerCase()] ?? null;
}

// Slug + display fields for every guide we ship — used to suggest alternatives
// when a requested city has no guide yet.
export function allCityGuides(): Array<{ slug: string; city: string; country: string }> {
  return Object.entries(CITY_GUIDES).map(([slug, g]) => ({ slug, city: g.city, country: g.country }));
}
