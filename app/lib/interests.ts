// Interest catalog — fixed vocabulary so the AI affiliate matcher has a
// reliable taxonomy to work against. Adding a new tag is a one-line change;
// removing one quietly drops it from existing user profiles.

export type InterestCategory =
  | "food_drink"
  | "art_design"
  | "music"
  | "outdoor"
  | "wellness"
  | "history"
  | "nightlife"
  | "family"
  | "shopping"
  | "work";

export type InterestTag = {
  slug: string;
  label: string;
  category: InterestCategory;
};

export const INTEREST_CATALOG: InterestTag[] = [
  // food + drink
  { slug: "specialty-coffee",   label: "Specialty coffee",        category: "food_drink" },
  { slug: "natural-wine",       label: "Natural wine",            category: "food_drink" },
  { slug: "street-food",        label: "Street food",             category: "food_drink" },
  { slug: "tasting-menus",      label: "Tasting menus",           category: "food_drink" },
  { slug: "coffee-roasting",    label: "Coffee roasting",         category: "food_drink" },
  { slug: "vegan",              label: "Plant-based",             category: "food_drink" },
  // art + design
  { slug: "contemporary-art",   label: "Contemporary art",        category: "art_design" },
  { slug: "architecture",       label: "Architecture walks",      category: "art_design" },
  { slug: "graphic-design",     label: "Graphic design",          category: "art_design" },
  { slug: "ceramics",           label: "Ceramics + craft",        category: "art_design" },
  { slug: "photography",        label: "Photography",             category: "art_design" },
  // music
  { slug: "live-jazz",          label: "Live jazz",               category: "music" },
  { slug: "electronic",         label: "Electronic / clubs",      category: "music" },
  { slug: "vinyl-record-shops", label: "Vinyl + record shops",    category: "music" },
  { slug: "classical-opera",    label: "Classical / opera",       category: "music" },
  // outdoor
  { slug: "hiking",             label: "Hiking",                  category: "outdoor" },
  { slug: "cycling",            label: "Cycling",                 category: "outdoor" },
  { slug: "surfing",            label: "Surfing",                 category: "outdoor" },
  { slug: "running",            label: "Running",                 category: "outdoor" },
  { slug: "open-water-swim",    label: "Open-water swimming",     category: "outdoor" },
  // wellness
  { slug: "yoga",               label: "Yoga",                    category: "wellness" },
  { slug: "spa-thermal",        label: "Spa + thermal baths",     category: "wellness" },
  { slug: "saunas",              label: "Saunas",                 category: "wellness" },
  // history
  { slug: "history",            label: "History + museums",       category: "history" },
  { slug: "religious-buildings",label: "Cathedrals + mosques",    category: "history" },
  // nightlife
  { slug: "rooftop-bars",       label: "Rooftop bars",            category: "nightlife" },
  { slug: "natural-wine-bars",  label: "Natural-wine bars",       category: "nightlife" },
  // family
  { slug: "family-friendly",    label: "Family-friendly",         category: "family" },
  { slug: "kid-museums",        label: "Kid-friendly museums",    category: "family" },
  // shopping
  { slug: "vintage",            label: "Vintage shopping",        category: "shopping" },
  { slug: "indie-bookshops",    label: "Indie bookshops",         category: "shopping" },
  { slug: "markets",            label: "Local markets",           category: "shopping" },
  // work
  { slug: "wfh",                label: "Working from there",      category: "work" },
  { slug: "coworking",          label: "Coworking spaces",        category: "work" },
];

export const INTEREST_BY_SLUG = new Map(INTEREST_CATALOG.map((t) => [t.slug, t]));

export const INTEREST_CATEGORIES: { id: InterestCategory; label: string }[] = [
  { id: "food_drink", label: "Food & drink" },
  { id: "art_design", label: "Art & design" },
  { id: "music",      label: "Music" },
  { id: "outdoor",    label: "Outdoors" },
  { id: "wellness",   label: "Wellness" },
  { id: "history",    label: "History" },
  { id: "nightlife",  label: "Nightlife" },
  { id: "family",     label: "Family" },
  { id: "shopping",   label: "Shopping" },
  { id: "work",       label: "Working away" },
];

export function parseInterests(raw: string | null | undefined): InterestTag[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => (typeof s === "string" ? INTEREST_BY_SLUG.get(s) : null))
      .filter((t): t is InterestTag => Boolean(t));
  } catch {
    return [];
  }
}

export function serialiseInterests(slugs: string[]): string {
  const valid = slugs.filter((s) => INTEREST_BY_SLUG.has(s));
  // De-dupe + cap at 12 to keep profiles legible.
  return JSON.stringify([...new Set(valid)].slice(0, 12));
}

export function groupByCategory(tags: InterestTag[]): Map<InterestCategory, InterestTag[]> {
  const out = new Map<InterestCategory, InterestTag[]>();
  for (const t of tags) {
    const arr = out.get(t.category) ?? [];
    arr.push(t);
    out.set(t.category, arr);
  }
  return out;
}
