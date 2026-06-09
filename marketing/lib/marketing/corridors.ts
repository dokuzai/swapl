import { CITY_LAUNCH_PAGES, type CityLaunchPage } from "@/lib/marketing/city-launch";

// A corridor is a directional demand-pair: travelers in `from` looking to swap
// into `to`. These are the long-tail, near-zero-competition search intents
// ("istanbul home swap from amsterdam") that swapl can own before launch — and
// each one only exists where BOTH ends are real launch cities, so the page never
// promises a corridor we can't actually form.

export type Corridor = {
  slug: string;
  to: CityLaunchPage;
  from: CityLaunchPage;
};

function citySlugFromName(name: string): string | null {
  const match = CITY_LAUNCH_PAGES.find(
    (page) => page.city.toLowerCase() === name.toLowerCase()
  );
  return match ? match.slug : null;
}

export const CORRIDORS: Corridor[] = CITY_LAUNCH_PAGES.flatMap((to) =>
  to.demandFrom
    .map((fromName) => {
      const fromSlug = citySlugFromName(fromName);
      if (!fromSlug) return null; // demand from a non-launch city — skip
      const from = CITY_LAUNCH_PAGES.find((p) => p.slug === fromSlug)!;
      return {
        slug: `${to.city.toLowerCase()}-home-swap-from-${from.city.toLowerCase()}`,
        to,
        from,
      } satisfies Corridor;
    })
    .filter((c): c is Corridor => c !== null)
);

export function getCorridor(slug: string): Corridor | null {
  return CORRIDORS.find((c) => c.slug === slug) ?? null;
}
