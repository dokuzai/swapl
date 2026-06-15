// Per-listing availability (DOK-159).
//
// THE single source of truth for "is this listing free for these dates?". Every
// surface that needs to respect occupied dates — Stay-with-Keys booking, swap
// proposals, the date-filtered browse, and the calendar date-picker — goes
// through here, so the rules live in exactly one place.
//
// A listing's bookable time is its published window [availableFrom, availableTo]
// MINUS every "occupied" range:
//   - active/confirmed SwapAgreements that overlap (status ACTIVE),
//   - pending/confirmed KeysStays that overlap,
//   - host-defined ListingBlockedRanges.
//
// Ranges are half-open [from, to): the checkout day frees up for the next guest.

import { prisma } from "@/lib/db";
import { nightsBetween } from "@/lib/keys/value";

/** Half-open overlap: [aFrom, aTo) intersects [bFrom, bTo). */
export function rangesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return aFrom < bTo && bFrom < aTo;
}

export type DateRange = { dateFrom: Date; dateTo: Date };

export type BookedRange = {
  dateFrom: string;
  dateTo: string;
  // Why the range is unavailable, so clients can label/colour it.
  source: "agreement" | "keys_stay" | "blocked";
};

// The columns availabilityFor needs to reason about a listing.
export type AvailabilityListing = {
  id: string;
  availableFrom: Date;
  availableTo: Date;
  minStayDays: number;
  maxStayDays: number;
};

export type AvailabilityResult = {
  listingId: string;
  availableFrom: string;
  availableTo: string;
  minStayDays: number;
  maxStayDays: number;
  // Occupied ranges inside (or touching) the window — clients grey these out.
  bookedRanges: BookedRange[];
};

/**
 * Load every occupied range for a listing from the DB:
 *   - ACTIVE SwapAgreements (this listing on either side),
 *   - pending/confirmed KeysStays,
 *   - host ListingBlockedRanges.
 * THE shared primitive — keys/stay.ts and proposal acceptance both use it so
 * the "what counts as taken" rule is never duplicated.
 */
export async function bookedRangesFor(listingId: string): Promise<Array<DateRange & { source: BookedRange["source"] }>> {
  const [agreements, stays, blocks] = await Promise.all([
    prisma.swapAgreement.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ listing1Id: listingId }, { listing2Id: listingId }],
      },
      select: { dateFrom: true, dateTo: true },
    }),
    prisma.keysStay.findMany({
      where: { listingId, status: { in: ["pending", "confirmed"] } },
      select: { dateFrom: true, dateTo: true },
    }),
    prisma.listingBlockedRange.findMany({
      where: { listingId },
      select: { dateFrom: true, dateTo: true },
    }),
  ]);

  return [
    ...agreements.map((a) => ({ dateFrom: a.dateFrom, dateTo: a.dateTo, source: "agreement" as const })),
    ...stays.map((s) => ({ dateFrom: s.dateFrom, dateTo: s.dateTo, source: "keys_stay" as const })),
    ...blocks.map((b) => ({ dateFrom: b.dateFrom, dateTo: b.dateTo, source: "blocked" as const })),
  ];
}

/**
 * Pure predicate: are [from, to) bookable given the listing's window, its
 * min/max stay, and the already-occupied ranges? No DB access — callers that
 * already hold the listing + ranges (e.g. inside a transaction) use this.
 */
export function isRangeAvailable(
  listing: AvailabilityListing,
  from: Date,
  to: Date,
  occupied: DateRange[],
): boolean {
  if (!(to.getTime() > from.getTime())) return false;
  if (from < listing.availableFrom || to > listing.availableTo) return false;

  const nights = nightsBetween(from, to);
  if (nights < listing.minStayDays || nights > listing.maxStayDays) return false;

  return !occupied.some((r) => rangesOverlap(from, to, r.dateFrom, r.dateTo));
}

/**
 * DB-backed availability check for a single listing + date range. Accepts
 * either a listing id (loads it) or an already-loaded listing slice.
 * Returns false for a missing listing.
 */
export async function isAvailable(
  listingOrId: string | AvailabilityListing,
  from: Date,
  to: Date,
): Promise<boolean> {
  const listing =
    typeof listingOrId === "string"
      ? await prisma.listing.findUnique({
          where: { id: listingOrId },
          select: { id: true, availableFrom: true, availableTo: true, minStayDays: true, maxStayDays: true },
        })
      : listingOrId;
  if (!listing) return false;

  const occupied = await bookedRangesFor(listing.id);
  return isRangeAvailable(listing, from, to, occupied);
}

/**
 * Full availability snapshot for a listing — the published window plus every
 * occupied range — for the calendar date-picker and Stay-with-Keys page.
 */
export async function availabilityFor(listing: AvailabilityListing): Promise<AvailabilityResult> {
  const occupied = await bookedRangesFor(listing.id);
  return {
    listingId: listing.id,
    availableFrom: listing.availableFrom.toISOString(),
    availableTo: listing.availableTo.toISOString(),
    minStayDays: listing.minStayDays,
    maxStayDays: listing.maxStayDays,
    bookedRanges: occupied
      .slice()
      .sort((a, b) => a.dateFrom.getTime() - b.dateFrom.getTime())
      .map((r) => ({ dateFrom: r.dateFrom.toISOString(), dateTo: r.dateTo.toISOString(), source: r.source })),
  };
}
