// Data assembly behind GET /api/discover/* (DOK-145). Kept out of the routes
// so it is unit-testable with a mocked prisma / city-media.
//
// Principles:
// - Env-gated: partners without an AFF_* id never appear.
// - Every affiliate URL points at /api/affiliate/{partner} so the click is
//   logged as an AffiliateClick row before the 302.
// - NO invented prices or availability: affiliate items carry no price; only
//   concierge items expose the real AddOn price from the DB.

import { prisma } from "@/lib/db";
import { getCachedCityMediaMap, cityMediaKey, type CityPhoto } from "@/lib/city-media";
import { configuredPartners, isPartnerConfigured, PARTNER_REGISTRY } from "@/lib/affiliates/registry";

const SERVICES_CAMPAIGN = "discover_services";
const EXPERIENCES_CAMPAIGN = "discover_experiences";

/** Cities shown when no `city` filter is given. */
export const TOP_CITIES_COUNT = 6;

export type DiscoverService = {
  slug: string;
  name: string;
  /** flights | esim | experiences | insurance | concierge | ... */
  category: string;
  tagline: string;
  /**
   * Click-through link via /api/affiliate/{partner} (UTM-tagged). Null for
   * concierge add-ons, which go through the concierge checkout instead.
   */
  url: string | null;
  iconHint: string;
  /** Real catalogue price — only for concierge add-ons, never invented. */
  priceCents: number | null;
  currency: string | null;
};

export type DiscoverExperience = {
  city: string;
  country: string;
  title: string;
  partner: "getyourguide";
  /** Click-through link via /api/affiliate/getyourguide with the city query. */
  url: string;
  /** Cached CityMedia photo; null → client renders its illustration. */
  photo: CityPhoto | null;
};

// Relative on purpose: clients resolve it against the API origin, and the
// redirector logs the click before the 302 to the partner.
function affiliateHref(partner: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return `/api/affiliate/${partner}?${qs.toString()}`;
}

const ADDON_ICON_BY_CATEGORY: Record<string, string> = {
  cleaning: "sparkles",
  lockbox: "key",
  transfer: "car",
  esim: "sim",
  guide: "map",
};

/**
 * The travel-services catalogue: one entry per configured affiliate partner
 * (static metadata from the registry) plus the active concierge add-ons from
 * the DB, with their real prices.
 */
export async function getDiscoverServices(): Promise<DiscoverService[]> {
  const partnerItems: DiscoverService[] = configuredPartners().map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    tagline: p.tagline,
    url: affiliateHref(p.slug, { utm_campaign: SERVICES_CAMPAIGN }),
    iconHint: p.iconHint,
    priceCents: null,
    currency: null,
  }));

  const addOns = await prisma.addOn.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" },
  });
  const addOnItems: DiscoverService[] = addOns.map((a) => ({
    slug: a.slug,
    name: a.name,
    category: "concierge",
    tagline: a.description,
    url: null,
    iconHint: ADDON_ICON_BY_CATEGORY[a.category] ?? "concierge",
    priceCents: a.priceCents,
    currency: a.currency,
  }));

  return [...partnerItems, ...addOnItems];
}

/** Themed cards for the single-city view. q drives the partner-side search. */
const CITY_THEMES: ReadonlyArray<{ title: (city: string) => string; q: (city: string) => string }> = [
  { title: (c) => `Things to do in ${c}`, q: (c) => c },
  { title: (c) => `Museums & culture in ${c}`, q: (c) => `museums ${c}` },
  { title: (c) => `Food & drink in ${c}`, q: (c) => `food tour ${c}` },
];

/**
 * Experience cards via GetYourGuide. With a `city` filter: a few themed
 * cards for that city. Without: one card per top city by active-listing
 * count (same groupBy the admin metrics use). Photos come from the CityMedia
 * cache only (never a live fetch — this is a browse surface); a city with no
 * cached photo gets photo: null.
 *
 * Env-gated: no AFF_GETYOURGUIDE_ID → empty catalogue.
 */
export async function getDiscoverExperiences(cityFilter?: string): Promise<DiscoverExperience[]> {
  const gyg = PARTNER_REGISTRY.find((p) => p.slug === "getyourguide");
  if (!gyg || !isPartnerConfigured(gyg)) return [];

  // Active-listing cities, most listings first — both the top-cities feed
  // and the country lookup for a filtered city come from this one groupBy.
  const groups = await prisma.listing.groupBy({
    by: ["city", "country"],
    where: { isActive: true, ineligibleReason: null },
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
  });

  let cities: Array<{ city: string; country: string }>;
  let themed: boolean;
  if (cityFilter) {
    const match = groups.find((g) => g.city.toLowerCase() === cityFilter.toLowerCase());
    // Unknown city: still answer (the partner search handles it), but we
    // have no country, so the photo lookup will simply miss → photo null.
    cities = [match ? { city: match.city, country: match.country } : { city: cityFilter, country: "" }];
    themed = true;
  } else {
    cities = groups.slice(0, TOP_CITIES_COUNT).map((g) => ({ city: g.city, country: g.country }));
    themed = false;
  }
  if (cities.length === 0) return [];

  const photosByCity = await getCachedCityMediaMap(cities);

  return cities.flatMap((c) => {
    const photo = photosByCity.get(cityMediaKey(c.city, c.country))?.[0] ?? null;
    const themes = themed ? CITY_THEMES : CITY_THEMES.slice(0, 1);
    return themes.map((t) => ({
      city: c.city,
      country: c.country,
      title: t.title(c.city),
      partner: "getyourguide" as const,
      url: affiliateHref("getyourguide", {
        city: c.city,
        country: c.country || undefined,
        q: t.q(c.city),
        utm_campaign: EXPERIENCES_CAMPAIGN,
      }),
      photo,
    }));
  });
}
