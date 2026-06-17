import { parseJSON } from "@/lib/db";
import { parseValuationExplanation, type ValuationExplanation } from "@/lib/keys/valuation";
import { paletteForCity } from "@/lib/cities";
import { publicCoord } from "@/lib/city-coords";
import { parseMotif } from "@/lib/ai/city-illustration";
import { safeParsePostcard } from "@/lib/ai/postcard-types";
import type { Postcard } from "@/lib/ai/postcard-types";
import type { Palette, CityMotif } from "@/components/illustrations";
import type { DictKey } from "@/lib/i18n/dict-en";
import { en } from "@/lib/i18n/dict-en";

// A serializable shape we can pass from server -> client components.
export type ListingDTO = {
  id: string;
  userId: string;
  ownerName: string | null;
  title: string;
  description: string;
  propertyType: "APARTMENT" | "HOUSE" | "LOFT" | "TOWNHOUSE";
  city: string;
  neighbourhood: string;
  country: string;
  sizeSqm: number;
  sleeps: number;
  bedrooms: number;
  bathrooms: number;
  floor: number | null;
  hasElevator: boolean;
  stepFreeAccess: boolean;
  petsAllowed: boolean;
  petTypes: string[];
  wfhSetup: boolean;
  wfhDesks: number;
  hasParking: boolean;
  bikeIncluded: boolean;
  rooftop: boolean;
  balcony: boolean;
  garden: boolean;
  courtyard: boolean;
  piano: boolean;
  pool: boolean;
  ac: boolean;
  washer: boolean;
  dryer: boolean;
  dishwasher: boolean;
  gym: boolean;
  // Street address — only present for the listing's owner.
  address: string | null;
  availableFrom: string;
  availableTo: string;
  minStayDays: number;
  maxStayDays: number;
  photos: string[];
  tags: string[];
  palette: Palette;
  motif: CityMotif[];
  postcard: Postcard | null;
  lat: number | null;
  lng: number | null;
  isFeatured: boolean;
  isVerified: boolean;
  // Owner-proof trust badge (DOK-162): host attested + admin-approved ownership.
  ownerVerified: boolean;
  // Unified valuation v2 (DOK-163 / DOK-160).
  spaceType: "entire_place" | "private_room";
  roomsOffered: number | null;
  nightlyKeys: number | null;
  locationTier: number | null;
  // Structured "how is this calculated" explanation — owner-only (null for
  // non-owners) so the breakdown isn't leaked to other members.
  valuationExplanation: ValuationExplanation | null;
};

type ListingRecord = {
  id: string;
  userId: string;
  user?: { name: string | null } | null;
  title: string;
  description: string;
  propertyType: string;
  city: string;
  neighbourhood: string;
  country: string;
  sizeSqm: number;
  sleeps: number;
  bedrooms: number;
  bathrooms: number;
  floor: number | null;
  hasElevator: boolean;
  stepFreeAccess: boolean;
  petsAllowed: boolean;
  petTypes: string;
  wfhSetup: boolean;
  wfhDesks: number;
  hasParking: boolean;
  bikeIncluded: boolean;
  rooftop: boolean;
  balcony: boolean;
  garden: boolean;
  courtyard: boolean;
  piano: boolean;
  pool: boolean;
  ac: boolean;
  washer: boolean;
  dryer: boolean;
  dishwasher: boolean;
  gym: boolean;
  address: string | null;
  availableFrom: Date;
  availableTo: Date;
  minStayDays: number;
  maxStayDays: number;
  photos: string;
  tags: string;
  paletteHint: string | null;
  motifHint: string | null;
  postcard: string | null;
  lat: number | null;
  lng: number | null;
  isFeatured?: boolean;
  isVerified?: boolean;
  ownerVerified?: boolean;
  featuredUntil?: Date | null;
  spaceType?: string;
  roomsOffered?: number | null;
  nightlyKeys?: number | null;
  locationTier?: number | null;
  valuationExplanation?: string | null;
};

export function toDTO(
  l: ListingRecord,
  opts?: { includeAddress?: boolean; includeValuation?: boolean; includeExactCoords?: boolean },
): ListingDTO {
  // Exact coordinates only go to the owner. Everyone else (public map, browse,
  // other hosts, anonymous profile visitors) gets the fuzzed area coordinate so
  // the precise home location is never disclosed. Default = fuzzed, so any new
  // call site is privacy-safe unless it explicitly opts in.
  const coords =
    opts?.includeExactCoords || l.lat == null || l.lng == null
      ? { lat: l.lat, lng: l.lng }
      : publicCoord(l.lat, l.lng, l.id);
  return {
    id: l.id,
    userId: l.userId,
    ownerName: l.user?.name ?? null,
    title: l.title,
    description: l.description,
    propertyType: l.propertyType as ListingDTO["propertyType"],
    city: l.city,
    neighbourhood: l.neighbourhood,
    country: l.country,
    sizeSqm: l.sizeSqm,
    sleeps: l.sleeps,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    floor: l.floor,
    hasElevator: l.hasElevator,
    stepFreeAccess: l.stepFreeAccess,
    petsAllowed: l.petsAllowed,
    petTypes: parseJSON<string[]>(l.petTypes, []),
    wfhSetup: l.wfhSetup,
    wfhDesks: l.wfhDesks,
    hasParking: l.hasParking,
    bikeIncluded: l.bikeIncluded,
    rooftop: l.rooftop,
    balcony: l.balcony,
    garden: l.garden,
    courtyard: l.courtyard,
    piano: l.piano,
    pool: l.pool,
    ac: l.ac,
    washer: l.washer,
    dryer: l.dryer,
    dishwasher: l.dishwasher,
    gym: l.gym,
    address: opts?.includeAddress ? l.address : null,
    availableFrom: l.availableFrom.toISOString(),
    availableTo: l.availableTo.toISOString(),
    minStayDays: l.minStayDays,
    maxStayDays: l.maxStayDays,
    photos: parseJSON<string[]>(l.photos, []),
    tags: parseJSON<string[]>(l.tags, []),
    palette: (l.paletteHint as Palette | null) ?? paletteForCity(l.city),
    motif: parseMotif(l.motifHint),
    postcard: safeParsePostcard(l.postcard),
    lat: coords.lat,
    lng: coords.lng,
    isFeatured: Boolean(l.isFeatured && l.featuredUntil && l.featuredUntil > new Date()),
    isVerified: Boolean(l.isVerified),
    ownerVerified: Boolean(l.ownerVerified),
    spaceType: (l.spaceType as ListingDTO["spaceType"]) ?? "entire_place",
    roomsOffered: l.roomsOffered ?? null,
    nightlyKeys: l.nightlyKeys ?? null,
    locationTier: l.locationTier ?? null,
    valuationExplanation: opts?.includeValuation
      ? parseValuationExplanation(l.valuationExplanation)
      : null,
  };
}

// Quick formatter for date ranges shown on cards. `locale` defaults to "en-US"
// to preserve existing behaviour for callers that don't pass one; client
// components pass the active locale (via useLocale()) so e.g. IT renders
// "23 ago – 8 set" instead of "Aug 23 – Sep 8".
export function formatDateRange(fromIso: string, toIso: string, locale: string = "en-US"): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${f.toLocaleDateString(locale, opts)} – ${t.toLocaleDateString(locale, opts)}`;
}

// A localizable amenity chip: a stable dict key plus optional template vars.
// UI consumers render it via `t(dict, chip.key, chip.vars)`; the AI/valuation
// path uses `amenityLabelsEn()` for stable English prompt input.
export type AmenityChip = { key: DictKey; vars?: Record<string, string | number> };

// Returns the amenity chips that are true on a listing, as stable i18n keys.
// Taxonomy mirrors mobile (iOS/Android `amenity_*`). The WFH chip carries the
// desk count so the active locale can render "WFH · 2 scrivanie" etc.
export function amenityChips(l: ListingDTO): AmenityChip[] {
  const out: AmenityChip[] = [];
  if (l.balcony) out.push({ key: "amenity.balcony" });
  if (l.rooftop) out.push({ key: "amenity.rooftop" });
  if (l.garden) out.push({ key: "amenity.garden" });
  if (l.courtyard) out.push({ key: "amenity.courtyard" });
  if (l.pool) out.push({ key: "amenity.pool" });
  if (l.piano) out.push({ key: "amenity.piano" });
  if (l.bikeIncluded) out.push({ key: "amenity.bike" });
  if (l.hasParking) out.push({ key: "amenity.parking" });
  if (l.wfhSetup)
    out.push(
      l.wfhDesks > 1
        ? { key: "amenity.workspaceDesks", vars: { n: l.wfhDesks } }
        : { key: "amenity.workspace" },
    );
  if (l.petsAllowed) out.push({ key: "amenity.pets" });
  if (l.stepFreeAccess) out.push({ key: "amenity.stepFree" });
  if (l.hasElevator) out.push({ key: "amenity.elevator" });
  if (l.ac) out.push({ key: "amenity.ac" });
  if (l.dishwasher) out.push({ key: "amenity.dishwasher" });
  if (l.washer) out.push({ key: "amenity.washer" });
  if (l.dryer) out.push({ key: "amenity.dryer" });
  return out;
}

// Stable ENGLISH amenity labels for non-UI consumers (AI prompt input for the
// listing-content drafter and the valuation engine). These must stay in English
// regardless of locale so prompts are deterministic — never localize this.
export function amenityLabelsEn(l: ListingDTO): string[] {
  return amenityChips(l).map((c) =>
    Object.entries(c.vars ?? {}).reduce<string>(
      (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
      en[c.key],
    ),
  );
}
