// AI window proposals (DOK-161).
//
// A TravelWindow is a saved "I want to travel around these dates" intent. This
// module turns one into ready-made swap proposals: REAL, active homes that are
// actually AVAILABLE in the window's dates (via lib/listing/availability.ts),
// ranked by the match engine + the member's travel profile, and offered both
// as a direct swap and — when the home is Stay-with-Keys-eligible — as a
// Keys stay. Nothing is invented; affiliate/pricing concerns live elsewhere.
//
// Reuses the same building blocks as the Get Inspired composer (match score,
// travel profile, availability) so the "what counts as a good, bookable home"
// rules are never duplicated.

import { prisma, parseJSON } from "@/lib/db";
import { computeMatchScore, type ScoreableListing } from "@/lib/match/score";
import { isRangeAvailable, bookedRangesFor, type AvailabilityListing } from "@/lib/listing/availability";
import { readTravelProfile, buildTravelProfile, type TravelProfileData } from "./travel-profile";

const CANDIDATE_POOL = 60;
const TOP_COUNT = 6;
const DESTINATION_BOOST = 12;
const TRAIT_CITY_BOOST = 10;
const WISHLIST_BOOST = 15;

export class WindowProposalError extends Error {
  constructor(public code: "NO_ACTIVE_LISTING", message: string) {
    super(message);
    this.name = "WindowProposalError";
  }
}

export type WindowProposal = {
  listingId: string;
  title: string;
  city: string;
  country: string;
  photo: string | null;
  matchScore: number;
  // Which swap modes this home supports for the window's dates.
  modes: {
    /** Direct home-for-home swap — always available for a real, free home. */
    directSwap: boolean;
    /** Stay-with-Keys — only when the host listed a per-night Keys value. */
    keysStay: boolean;
  };
  nightlyKeys: number | null;
  /** Short, data-grounded reason this home fits the window. */
  why: string;
  /** True when the home also sits in one of the window's preferred destinations. */
  matchesDestination: boolean;
};

export type WindowProposalsResult = {
  windowId: string;
  dates: { from: string; to: string; flexible: boolean };
  destinations: string[];
  proposals: WindowProposal[];
};

type ListingRow = {
  id: string;
  userId: string;
  title: string;
  city: string;
  country: string;
  neighbourhood: string;
  sizeSqm: number;
  sleeps: number;
  petsAllowed: boolean;
  wfhSetup: boolean;
  stepFreeAccess: boolean;
  availableFrom: Date;
  availableTo: Date;
  minStayDays: number;
  maxStayDays: number;
  nightlyKeys: number | null;
  photos: string;
};

const LISTING_SELECT = {
  id: true,
  userId: true,
  title: true,
  city: true,
  country: true,
  neighbourhood: true,
  sizeSqm: true,
  sleeps: true,
  petsAllowed: true,
  wfhSetup: true,
  stepFreeAccess: true,
  availableFrom: true,
  availableTo: true,
  minStayDays: true,
  maxStayDays: true,
  nightlyKeys: true,
  photos: true,
} as const;

function toScoreable(l: ListingRow): ScoreableListing {
  return {
    sizeSqm: l.sizeSqm,
    sleeps: l.sleeps,
    availableFrom: l.availableFrom,
    availableTo: l.availableTo,
    petsAllowed: l.petsAllowed,
    wfhSetup: l.wfhSetup,
    stepFreeAccess: l.stepFreeAccess,
    city: l.city,
    neighbourhood: l.neighbourhood,
  };
}

function toAvailabilityListing(l: ListingRow): AvailabilityListing {
  return {
    id: l.id,
    availableFrom: l.availableFrom,
    availableTo: l.availableTo,
    minStayDays: l.minStayDays,
    maxStayDays: l.maxStayDays,
  };
}

function firstPhoto(l: ListingRow): string | null {
  return parseJSON<string[]>(l.photos, [])[0] ?? null;
}

/** Case-insensitive membership against the window's preferred city/country list. */
function inDestinations(l: ListingRow, destinations: string[]): boolean {
  if (destinations.length === 0) return false;
  const hay = [l.city.toLowerCase(), l.country.toLowerCase()];
  return destinations.some((d) => hay.includes(d.trim().toLowerCase()));
}

function buildWhy(
  l: ListingRow,
  score: number,
  matchesDestination: boolean,
  wishlisted: boolean,
  modes: WindowProposal["modes"],
): string {
  const bits: string[] = [];
  if (matchesDestination) bits.push(`it's in ${l.city}, one of your wishlist destinations`);
  else bits.push(`${l.city} is free for your exact dates`);
  if (wishlisted) bits.push("it's already on your wishlist");
  if (modes.keysStay) bits.push("you can also book it with Keys");
  return `A ${score}% match — ${bits.join(", and ")}.`;
}

/** Parse the optional destinations JSON into a clean string[]. */
export function parseDestinations(raw: string | null): string[] {
  const arr = parseJSON<unknown[]>(raw ?? "[]", []);
  return arr.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim());
}

export type WindowLike = {
  id: string;
  userId: string;
  dateFrom: Date;
  dateTo: Date;
  flexible: boolean;
  destinations: string | null;
};

/**
 * Compose ready-made swap proposals for a saved travel window: real, active,
 * available homes ranked by match score + travel profile, each annotated with
 * the swap modes (direct swap + Stay-with-Keys) it supports for the window.
 *
 * Honours the user's most recent active listing as their "home" for matching;
 * throws WindowProposalError("NO_ACTIVE_LISTING") if they have none (a swap
 * needs two homes). Availability is checked per-candidate against the window's
 * dates so nothing that's already booked or outside its published window is
 * ever proposed.
 */
export async function composeWindowProposals(window: WindowLike): Promise<WindowProposalsResult> {
  const from = window.dateFrom;
  const to = window.dateTo;
  const destinations = parseDestinations(window.destinations);

  const [mine, favorites, profile] = await Promise.all([
    prisma.listing.findFirst({
      where: { userId: window.userId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: LISTING_SELECT,
    }) as Promise<ListingRow | null>,
    prisma.favorite.findMany({ where: { userId: window.userId }, select: { listingId: true } }),
    readTravelProfile(window.userId).then((p) => p ?? buildTravelProfile(window.userId)),
  ]);

  if (!mine) {
    throw new WindowProposalError(
      "NO_ACTIVE_LISTING",
      "You need an active listing before we can find swaps for your dates.",
    );
  }

  // Real, active, NOT-mine homes whose published window overlaps the dates.
  // A requested destination narrows the candidate pool to those cities/countries.
  const candidates = (await prisma.listing.findMany({
    where: {
      isActive: true,
      NOT: { userId: window.userId },
      availableFrom: { lte: to },
      availableTo: { gte: from },
      ...(destinations.length > 0
        ? { OR: [{ city: { in: destinations } }, { country: { in: destinations } }] }
        : {}),
    },
    take: CANDIDATE_POOL,
    select: LISTING_SELECT,
  })) as ListingRow[];

  const wishlist = new Set(favorites.map((f) => f.listingId));
  const traitCities = new Set((profile?.traits.cities ?? []).map((c: string) => c.toLowerCase()));
  const mineScoreable = toScoreable(mine);

  // Per-candidate availability against the EXACT window dates — the single
  // source of truth (occupied ranges + min/max stay + published window).
  const checked = await Promise.all(
    candidates.map(async (l) => {
      const occupied = await bookedRangesFor(l.id);
      const available = isRangeAvailable(toAvailabilityListing(l), from, to, occupied);
      return { l, available };
    }),
  );

  const scored = checked
    .filter((c) => c.available)
    .map(({ l }) => {
      const matchesDestination = inDestinations(l, destinations);
      const wishlisted = wishlist.has(l.id);
      let score = computeMatchScore(mineScoreable, toScoreable(l));
      if (matchesDestination) score += DESTINATION_BOOST;
      if (traitCities.has(l.city.toLowerCase())) score += TRAIT_CITY_BOOST;
      if (wishlisted) score += WISHLIST_BOOST;
      score = Math.min(100, score);

      const modes = { directSwap: true, keysStay: typeof l.nightlyKeys === "number" && l.nightlyKeys > 0 };
      const proposal: WindowProposal = {
        listingId: l.id,
        title: l.title,
        city: l.city,
        country: l.country,
        photo: firstPhoto(l),
        matchScore: score,
        modes,
        nightlyKeys: l.nightlyKeys ?? null,
        why: buildWhy(l, score, matchesDestination, wishlisted, modes),
        matchesDestination,
      };
      return proposal;
    })
    .sort((a, b) => Number(b.matchesDestination) - Number(a.matchesDestination) || b.matchScore - a.matchScore)
    .slice(0, TOP_COUNT);

  return {
    windowId: window.id,
    dates: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), flexible: window.flexible },
    destinations,
    proposals: scored,
  };
}

// Surface the profile type for callers that want to log/inspect it.
export type { TravelProfileData };
