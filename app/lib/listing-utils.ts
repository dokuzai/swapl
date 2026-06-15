import { parseJSON } from "@/lib/db";
import { parseValuationExplanation, type ValuationExplanation } from "@/lib/keys/valuation";
import { paletteForCity } from "@/lib/cities";
import { parseMotif } from "@/lib/ai/city-illustration";
import { safeParsePostcard } from "@/lib/ai/postcard-types";
import type { Postcard } from "@/lib/ai/postcard-types";
import type { Palette, CityMotif } from "@/components/illustrations";

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
  opts?: { includeAddress?: boolean; includeValuation?: boolean },
): ListingDTO {
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
    lat: l.lat,
    lng: l.lng,
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

// Returns an array of [key, label] for amenity chips that are true on a listing.
export function amenityChips(l: ListingDTO): string[] {
  const out: string[] = [];
  if (l.balcony) out.push("Balcony");
  if (l.rooftop) out.push("Rooftop");
  if (l.garden) out.push("Garden");
  if (l.courtyard) out.push("Courtyard");
  if (l.pool) out.push("Pool");
  if (l.piano) out.push("Piano");
  if (l.bikeIncluded) out.push("Bike incl.");
  if (l.hasParking) out.push("Parking");
  if (l.wfhSetup) out.push(`WFH${l.wfhDesks > 1 ? ` ${l.wfhDesks} desks` : ""}`);
  if (l.petsAllowed) out.push("Pet-friendly");
  if (l.stepFreeAccess) out.push("Step-free");
  if (l.hasElevator) out.push("Elevator");
  if (l.ac) out.push("AC");
  if (l.dishwasher) out.push("Dishwasher");
  if (l.washer) out.push("Washer");
  if (l.dryer) out.push("Dryer");
  return out;
}
