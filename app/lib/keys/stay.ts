// Non-simultaneous "Stay with Keys" service (DOK-155).
//
// A guest books nights at a host's listing and pays in Keys. Unlike a direct
// SwapAgreement (two homes, one window, simultaneous), this is one-directional:
// the guest stays at the host's home, the host need not travel.
//
// Lifecycle + ledger:
//   create   → HOLD the guest's Keys, KeysStay.status = pending, notify host
//   confirm  → host accepts: the hold is released and turned into a real
//              spend_stay (guest) + earn_host (host); a cover policy is issued
//   decline  → host rejects: the hold is RELEASED back to the guest
//   cancel   → guest cancels a pending stay: the hold is RELEASED
//
// All Keys movements go through lib/keys/ledger (atomic, no negative balance).

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { earn, hold, release, spend } from "@/lib/keys/ledger";
import { nightlyKeysFor, nightsBetween, keysCostFor } from "@/lib/keys/value";
import { bookedRangesFor, rangesOverlap } from "@/lib/listing/availability";
import { insuranceProvider } from "@/lib/insurance";
import { isListingDateOverlapError, occupyListing, releaseListingOccupancy } from "@/lib/listing/occupancy";

export class KeysStayError extends Error {
  constructor(
    public code:
      | "LISTING_NOT_FOUND"
      | "OWN_LISTING"
      | "INACTIVE_LISTING"
      | "BAD_DATES"
      | "OUTSIDE_AVAILABILITY"
      | "DATES_TAKEN"
      | "INSUFFICIENT_KEYS"
      | "STAY_NOT_FOUND"
      | "NOT_HOST"
      | "NOT_GUEST"
      | "BAD_STATE"
      | "COUCHSURF_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "KeysStayError";
  }
}

const NIGHT_MS = 24 * 60 * 60 * 1000;

export type AvailabilityResult = {
  listingId: string;
  nightlyKeys: number;
  availableFrom: string;
  availableTo: string;
  minStayDays: number;
  maxStayDays: number;
  // Date ranges already taken by pending/confirmed Keys stays — clients grey
  // these out. ISO date strings.
  bookedRanges: Array<{ dateFrom: string; dateTo: string }>;
};

/** Derive bookable dates + nightly Keys for a listing's Stay-with-Keys page. */
export async function keysAvailability(listingId: string): Promise<AvailabilityResult> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      isActive: true,
      sizeSqm: true,
      sleeps: true,
      city: true,
      isVerified: true,
      spaceType: true,
      roomsOffered: true,
      nightlyKeysBase: true,
      nightlyKeysAdjustment: true,
      availableFrom: true,
      availableTo: true,
      minStayDays: true,
      maxStayDays: true,
    },
  });
  if (!listing) throw new KeysStayError("LISTING_NOT_FOUND", "Listing not found");
  if (!listing.isActive) throw new KeysStayError("LISTING_NOT_FOUND", "Listing not found");

  const nightly = nightlyKeysFor(listing);

  // All occupied ranges (agreements + Keys stays + host blocks) via the single
  // availability helper — no separate "what's taken" rule lives here.
  const taken = await bookedRangesFor(listing.id);

  return {
    listingId: listing.id,
    nightlyKeys: nightly,
    availableFrom: listing.availableFrom.toISOString(),
    availableTo: listing.availableTo.toISOString(),
    minStayDays: listing.minStayDays,
    maxStayDays: listing.maxStayDays,
    bookedRanges: taken
      .slice()
      .sort((a, b) => a.dateFrom.getTime() - b.dateFrom.getTime())
      .map((t) => ({
        dateFrom: t.dateFrom.toISOString(),
        dateTo: t.dateTo.toISOString(),
      })),
  };
}

export type CreatedStay = {
  id: string;
  status: string;
  nights: number;
  keysCost: number;
  hostId: string;
};

/**
 * Create a pending stay: validate dates/availability/conflicts, compute the
 * Keys cost, and HOLD the guest's Keys atomically with the KeysStay row.
 * Throws INSUFFICIENT_KEYS (via the ledger guard) if the guest can't cover it.
 */
export async function createKeysStay(args: {
  listingId: string;
  guestId: string;
  dateFrom: Date;
  dateTo: Date;
  // DOK-219: "couchsurf" stays are free (no Keys) and require the host to offer a
  // couch. The caller (route) enforces the Couchsurfer membership gate.
  kind?: "keys" | "couchsurf";
}): Promise<CreatedStay> {
  const { listingId, guestId, dateFrom, dateTo, kind = "keys" } = args;

  if (!(dateTo.getTime() > dateFrom.getTime())) {
    throw new KeysStayError("BAD_DATES", "End date must be after start date");
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      userId: true,
      isActive: true,
      sizeSqm: true,
      sleeps: true,
      city: true,
      isVerified: true,
      spaceType: true,
      roomsOffered: true,
      couchsurfingAvailable: true,
      nightlyKeysBase: true,
      nightlyKeysAdjustment: true,
      availableFrom: true,
      availableTo: true,
      minStayDays: true,
      maxStayDays: true,
    },
  });
  if (!listing) throw new KeysStayError("LISTING_NOT_FOUND", "Listing not found");
  if (!listing.isActive) throw new KeysStayError("INACTIVE_LISTING", "Listing is not active");
  if (listing.userId === guestId) {
    throw new KeysStayError("OWN_LISTING", "Cannot book your own listing");
  }
  if (kind === "couchsurf" && !listing.couchsurfingAvailable) {
    throw new KeysStayError("COUCHSURF_UNAVAILABLE", "This home doesn't offer couchsurfing");
  }

  // Within the listing's published availability window.
  if (dateFrom < listing.availableFrom || dateTo > listing.availableTo) {
    throw new KeysStayError("OUTSIDE_AVAILABILITY", "Dates are outside the listing's availability");
  }

  const nights = nightsBetween(dateFrom, dateTo);
  if (nights < listing.minStayDays || nights > listing.maxStayDays) {
    throw new KeysStayError("BAD_DATES", `Stay must be between ${listing.minStayDays} and ${listing.maxStayDays} nights`);
  }

  // No overlap with anything that occupies the listing — other Keys stays,
  // active swap agreements, or host-blocked ranges (single availability helper).
  const conflicts = await bookedRangesFor(listingId);
  if (conflicts.some((c) => rangesOverlap(dateFrom, dateTo, c.dateFrom, c.dateTo))) {
    throw new KeysStayError("DATES_TAKEN", "Those dates are already booked");
  }

  // Couchsurf stays are free; Keys stays cost capacity × nights.
  const keysCost = kind === "couchsurf" ? 0 : keysCostFor(nightlyKeysFor(listing), nights);

  // Create the stay row and hold the guest's Keys in one transaction. The
  // ledger guard throws NEGATIVE_BALANCE if the guest can't afford it, rolling
  // the whole transaction back (no orphan pending stay).
  let stay: { id: string; status: string };
  try {
    stay = await prisma.$transaction(async (tx) => {
    const activeAgreements = await tx.swapAgreement.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ listing1Id: listingId }, { listing2Id: listingId }],
      },
      select: { dateFrom: true, dateTo: true },
    });
    const activeStays = await tx.keysStay.findMany({
      where: { listingId, status: { in: ["pending", "confirmed"] } },
      select: { dateFrom: true, dateTo: true },
    });
    const hostBlocks = await tx.listingBlockedRange.findMany({
      where: { listingId },
      select: { dateFrom: true, dateTo: true },
    });
    const txConflicts = [...activeAgreements, ...activeStays, ...hostBlocks];
    if (txConflicts.some((c) => rangesOverlap(dateFrom, dateTo, c.dateFrom, c.dateTo))) {
      throw new KeysStayError("DATES_TAKEN", "Those dates are already booked");
    }
    const created = await tx.keysStay.create({
      data: {
        listingId,
        guestId,
        hostId: listing.userId,
        dateFrom,
        dateTo,
        nights,
        keysCost,
        kind,
        status: "pending",
      },
    });
    await occupyListing(tx, {
      listingId,
      source: "keys_stay",
      sourceId: created.id,
      dateFrom,
      dateTo,
    });
    // Couchsurf stays move no Keys — skip the hold entirely.
    if (kind !== "couchsurf") {
      await hold(guestId, keysCost, { stayId: created.id, note: `Hold for stay ${created.id}` }, tx as Prisma.TransactionClient);
    }
    return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (isListingDateOverlapError(err)) {
      throw new KeysStayError("DATES_TAKEN", "Those dates are already booked");
    }
    throw err;
  }

  return { id: stay.id, status: stay.status, nights, keysCost, hostId: listing.userId };
}

/**
 * Host confirms a pending stay: release the guest's hold and convert it into a
 * real spend (guest) + earn (host), flip status to confirmed, and issue a
 * cover policy. All ledger writes + the status update are one transaction; the
 * policy is bound on the underwriter first so a failure there leaves the stay
 * confirmed with insurancePolicyId still null (retryable), never charging twice.
 */
export async function confirmKeysStay(stayId: string, hostId: string): Promise<{ id: string; keysCost: number }> {
  const stay = await prisma.keysStay.findUnique({
    where: { id: stayId },
    include: {
      listing: {
        select: { id: true, city: true, neighbourhood: true, country: true, address: true, sizeSqm: true },
      },
      guest: { select: { id: true, name: true, email: true } },
      host: { select: { id: true, name: true, email: true } },
    },
  });
  if (!stay) throw new KeysStayError("STAY_NOT_FOUND", "Stay not found");
  if (stay.hostId !== hostId) throw new KeysStayError("NOT_HOST", "Only the host can confirm");
  if (stay.status !== "pending") throw new KeysStayError("BAD_STATE", `Cannot confirm a ${stay.status} stay`);

  // Bind the policy with the underwriter before the ledger transaction. For a
  // one-directional stay we pass the single (host's) home as both sizes so the
  // mock pricing still resolves; the guest is the named insured party.
  const provider = insuranceProvider();
  let policyResult: Awaited<ReturnType<typeof provider.createPolicy>> | null = null;
  try {
    policyResult = await provider.createPolicy({
      agreementId: `keysstay_${stay.id}`,
      parties: [
        {
          userId: stay.guest.id,
          fullName: stay.guest.name ?? stay.guest.email,
          email: stay.guest.email,
          listing: {
            id: stay.listing.id,
            city: stay.listing.city,
            neighbourhood: stay.listing.neighbourhood,
            country: stay.listing.country,
            address: stay.listing.address,
            sizeSqm: stay.listing.sizeSqm,
          },
        },
        {
          userId: stay.host.id,
          fullName: stay.host.name ?? stay.host.email,
          email: stay.host.email,
          listing: {
            id: stay.listing.id,
            city: stay.listing.city,
            neighbourhood: stay.listing.neighbourhood,
            country: stay.listing.country,
            address: stay.listing.address,
            sizeSqm: stay.listing.sizeSqm,
          },
        },
      ],
      dateFrom: stay.dateFrom,
      dateTo: stay.dateTo,
    });
  } catch (err) {
    console.error("[keys-stay:insurance]", err);
  }

  await prisma.$transaction(async (tx) => {
    const t = tx as Prisma.TransactionClient;
    // First-writer-wins: atomically claim the pending→confirmed transition.
    // updateMany takes a row lock, so a concurrent confirm/decline that already
    // flipped the row matches zero rows here and we bail without moving any Keys.
    // (A non-locking findUnique re-read did NOT serialize under READ COMMITTED.)
    const claimed = await t.keysStay.updateMany({
      where: { id: stay.id, status: "pending" },
      data: {
        status: "confirmed",
        insurancePolicyId: policyResult?.externalId ?? null,
      },
    });
    if (claimed.count !== 1) {
      throw new KeysStayError("BAD_STATE", "Stay is no longer pending");
    }

    // Keys stays move Keys: release the hold, take the real spend from the guest
    // and credit the host (net guest effect -keysCost). Couchsurf stays are free,
    // so no Keys moved at request time and none move now. Each write carries a
    // deterministic eventKey so a duplicate can never be inserted.
    if (stay.kind !== "couchsurf") {
      await release(stay.guestId, stay.keysCost, { stayId: stay.id, note: "Release hold on confirm", eventKey: `keysstay:${stay.id}:confirm:release` }, t);
      await spend(stay.guestId, stay.keysCost, { stayId: stay.id, note: "Stay confirmed", eventKey: `keysstay:${stay.id}:confirm:spend` }, t);
      await earn(stay.hostId, stay.keysCost, { stayId: stay.id, note: "Hosted a Keys stay", eventKey: `keysstay:${stay.id}:confirm:earn` }, t);
    }
  });

  return { id: stay.id, keysCost: stay.keysCost };
}

/**
 * Host declines (or guest cancels) a pending stay: release the held Keys back
 * to the guest and mark the stay declined/cancelled. Idempotent guard: only a
 * pending stay can transition.
 */
export async function releaseKeysStay(
  stayId: string,
  byUserId: string,
  outcome: "declined" | "cancelled",
): Promise<{ id: string }> {
  const stay = await prisma.keysStay.findUnique({
    where: { id: stayId },
    select: { id: true, status: true, guestId: true, hostId: true, keysCost: true, kind: true },
  });
  if (!stay) throw new KeysStayError("STAY_NOT_FOUND", "Stay not found");

  if (outcome === "declined" && stay.hostId !== byUserId) {
    throw new KeysStayError("NOT_HOST", "Only the host can decline");
  }
  if (outcome === "cancelled" && stay.guestId !== byUserId) {
    throw new KeysStayError("NOT_GUEST", "Only the guest can cancel");
  }
  if (stay.status !== "pending") {
    throw new KeysStayError("BAD_STATE", `Cannot ${outcome} a ${stay.status} stay`);
  }

  await prisma.$transaction(async (tx) => {
    const t = tx as Prisma.TransactionClient;
    // First-writer-wins: atomically claim the pending→outcome transition so a
    // concurrent cancel/decline (or a double-tap) can't release the hold twice.
    const claimed = await t.keysStay.updateMany({
      where: { id: stay.id, status: "pending" },
      data: { status: outcome },
    });
    if (claimed.count !== 1) {
      throw new KeysStayError("BAD_STATE", "Stay is no longer pending");
    }
    // Only Keys stays have a hold to release; couchsurf stays moved no Keys.
    // eventKey makes the release idempotent even if the gate were ever bypassed.
    if (stay.kind !== "couchsurf") {
      await release(stay.guestId, stay.keysCost, { stayId: stay.id, note: `Hold released (${outcome})`, eventKey: `keysstay:${stay.id}:${outcome}:release` }, t);
    }
    await releaseListingOccupancy(t, { source: "keys_stay", sourceId: stay.id });
  });

  return { id: stay.id };
}

export { NIGHT_MS };
