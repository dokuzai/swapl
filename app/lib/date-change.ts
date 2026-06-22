// In-chat date-change requests (DOK-221, Phase 3).
//
// A principal proposes new dates for an existing transaction; the counterpart
// accepts or declines, all tracked as conversation events. On accept the booking
// is actually moved, with full availability re-validation and — for confirmed
// Keys stays — a Keys re-pricing settlement. At most one request is in flight
// per conversation (held on the Conversation row).

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { nightsBetween, keysCostFor, nightlyKeysFor } from "@/lib/keys/value";
import { isRangeAvailable, type DateRange, type AvailabilityListing } from "@/lib/listing/availability";
import { occupyListing, releaseListingOccupancy } from "@/lib/listing/occupancy";
import { spend, earn, refund, hold, release, applyTransaction } from "@/lib/keys/ledger";
import { recordEvent } from "@/lib/conversations";

export class DateChangeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DateChangeError";
  }
}

// A Prisma transaction client OR the root client.
type Db = Prisma.TransactionClient | typeof prisma;

const LISTING_SLICE = {
  id: true,
  availableFrom: true,
  availableTo: true,
  minStayDays: true,
  maxStayDays: true,
} as const;

// Occupied ranges for a listing, EXCLUDING the booking being moved (so a swap/
// stay never conflicts with its own current dates). Mirrors bookedRangesFor but
// adds the self-exclusion the reschedule needs.
async function occupancyExcluding(
  db: Db,
  listingId: string,
  exclude: { agreementId?: string; stayId?: string },
): Promise<DateRange[]> {
  const [agreements, stays, blocks] = await Promise.all([
    db.swapAgreement.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ listing1Id: listingId }, { listing2Id: listingId }],
        ...(exclude.agreementId ? { id: { not: exclude.agreementId } } : {}),
      },
      select: { dateFrom: true, dateTo: true },
    }),
    db.keysStay.findMany({
      where: {
        listingId,
        status: { in: ["pending", "confirmed"] },
        ...(exclude.stayId ? { id: { not: exclude.stayId } } : {}),
      },
      select: { dateFrom: true, dateTo: true },
    }),
    db.listingBlockedRange.findMany({ where: { listingId }, select: { dateFrom: true, dateTo: true } }),
  ]);
  return [...agreements, ...stays, ...blocks];
}

// Occupied ranges WITH their source label, excluding the booking being moved —
// for the calendar picker (greys out taken dates but not the booking's own).
async function occupancyWithSource(
  db: Db,
  listingId: string,
  exclude: { agreementId?: string; stayId?: string },
): Promise<{ dateFrom: Date; dateTo: Date; source: string }[]> {
  const [agreements, stays, blocks] = await Promise.all([
    db.swapAgreement.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ listing1Id: listingId }, { listing2Id: listingId }],
        ...(exclude.agreementId ? { id: { not: exclude.agreementId } } : {}),
      },
      select: { dateFrom: true, dateTo: true },
    }),
    db.keysStay.findMany({
      where: {
        listingId,
        status: { in: ["pending", "confirmed"] },
        ...(exclude.stayId ? { id: { not: exclude.stayId } } : {}),
      },
      select: { dateFrom: true, dateTo: true },
    }),
    db.listingBlockedRange.findMany({ where: { listingId }, select: { dateFrom: true, dateTo: true } }),
  ]);
  return [
    ...agreements.map((a) => ({ dateFrom: a.dateFrom, dateTo: a.dateTo, source: "agreement" })),
    ...stays.map((s) => ({ dateFrom: s.dateFrom, dateTo: s.dateTo, source: "keys_stay" })),
    ...blocks.map((b) => ({ dateFrom: b.dateFrom, dateTo: b.dateTo, source: "blocked" })),
  ];
}

// Availability snapshot for the date-change picker (ListingAvailability shape) +
// the booking's current dates to preselect. For a swap it's the COMBINED picture
// of both homes: window = intersection, min/max = tightest, taken = union (each
// excluding this booking's own occupancy).
export type DateChangeContext = {
  availability: {
    listingId: string;
    availableFrom: string;
    availableTo: string;
    minStayDays: number;
    maxStayDays: number;
    bookedRanges: { dateFrom: string; dateTo: string; source: string }[];
  };
  currentFrom: string;
  currentTo: string;
};

export async function dateChangeContext(conversationId: string, userId: string): Promise<DateChangeContext> {
  const convo = await loadContext(prisma, conversationId);
  const allowed = await principals(prisma, convo);
  if (!allowed.includes(userId)) throw new DateChangeError("FORBIDDEN", "Only the booking's parties can change dates.");

  if (convo.keysStay) {
    const l = convo.keysStay.listing as AvailabilityListing;
    const occ = await occupancyWithSource(prisma, l.id, { stayId: convo.keysStay.id });
    return {
      availability: {
        listingId: l.id,
        availableFrom: l.availableFrom.toISOString(),
        availableTo: l.availableTo.toISOString(),
        minStayDays: l.minStayDays,
        maxStayDays: l.maxStayDays,
        bookedRanges: occ.map((r) => ({ dateFrom: r.dateFrom.toISOString(), dateTo: r.dateTo.toISOString(), source: r.source })),
      },
      currentFrom: convo.keysStay.dateFrom.toISOString(),
      currentTo: convo.keysStay.dateTo.toISOString(),
    };
  }
  if (convo.proposal?.agreement) {
    const agreementId = convo.proposal.agreement.id;
    const [l1, l2] = await Promise.all([
      prisma.listing.findUnique({ where: { id: convo.proposal.proposerListingId }, select: LISTING_SLICE }),
      prisma.listing.findUnique({ where: { id: convo.proposal.targetListingId }, select: LISTING_SLICE }),
    ]);
    if (!l1 || !l2) throw new DateChangeError("NOT_FOUND", "A home in this swap no longer exists.");
    const [o1, o2] = await Promise.all([
      occupancyWithSource(prisma, l1.id, { agreementId }),
      occupancyWithSource(prisma, l2.id, { agreementId }),
    ]);
    const availableFrom = new Date(Math.max(l1.availableFrom.getTime(), l2.availableFrom.getTime()));
    const availableTo = new Date(Math.min(l1.availableTo.getTime(), l2.availableTo.getTime()));
    return {
      availability: {
        listingId: l1.id,
        availableFrom: availableFrom.toISOString(),
        availableTo: availableTo.toISOString(),
        minStayDays: Math.max(l1.minStayDays, l2.minStayDays),
        maxStayDays: Math.min(l1.maxStayDays, l2.maxStayDays),
        bookedRanges: [...o1, ...o2].map((r) => ({ dateFrom: r.dateFrom.toISOString(), dateTo: r.dateTo.toISOString(), source: r.source })),
      },
      currentFrom: convo.proposal.agreement.dateFrom.toISOString(),
      currentTo: convo.proposal.agreement.dateTo.toISOString(),
    };
  }
  throw new DateChangeError("NOT_ACCEPTED", "Date changes apply to accepted swaps and stays.");
}

type ConversationContext = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(db: Db, conversationId: string) {
  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      proposal: { include: { agreement: true } },
      keysStay: {
        include: {
          listing: {
            select: { ...LISTING_SLICE, userId: true, sleeps: true, sizeSqm: true, city: true, isVerified: true },
          },
        },
      },
    },
  });
  if (!convo) throw new DateChangeError("NOT_FOUND", "Conversation not found");
  return convo;
}

// Who may propose/respond to a date change — the two PRINCIPALS only (guests on
// a multi-party swap can chat but never change the booking). Swap principals
// need the target listing's owner id, which isn't on the proposal row directly.
async function swapPrincipalIds(db: Db, proposal: { proposerId: string; targetListingId: string }): Promise<string[]> {
  const target = await db.listing.findUnique({ where: { id: proposal.targetListingId }, select: { userId: true } });
  return [proposal.proposerId, target?.userId].filter((x): x is string => Boolean(x));
}

async function principals(db: Db, convo: ConversationContext): Promise<string[]> {
  if (convo.keysStay) return [convo.keysStay.guestId, convo.keysStay.hostId];
  if (convo.proposal) return swapPrincipalIds(db, convo.proposal);
  return [];
}

// Propose new dates. Validates the caller is a principal, the range is sane and
// available (excluding this booking's own current dates), then stores the
// pending request and records a change_requested event.
export async function requestDateChange(
  conversationId: string,
  userId: string,
  from: Date,
  to: Date,
  byName: string | null,
): Promise<void> {
  if (!(to.getTime() > from.getTime())) {
    throw new DateChangeError("BAD_RANGE", "End date must be after start.");
  }
  const convo = await loadContext(prisma, conversationId);
  const allowed = await principals(prisma, convo);
  if (!allowed.includes(userId)) throw new DateChangeError("FORBIDDEN", "Only the booking's parties can change dates.");

  await assertAvailable(prisma, convo, from, to);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { pendingChangeFrom: from, pendingChangeTo: to, pendingChangeById: userId, pendingChangeAt: new Date() },
  });
  await recordEvent(conversationId, "change_requested", {
    from: from.toISOString(),
    to: to.toISOString(),
    by: byName,
    byId: userId,
  });
}

// Validate that the proposed range fits every listing the booking occupies,
// excluding the booking's own current occupancy. Throws DateChangeError on fail.
async function assertAvailable(db: Db, convo: ConversationContext, from: Date, to: Date): Promise<void> {
  if (convo.keysStay) {
    const listing = convo.keysStay.listing as AvailabilityListing;
    const occ = await occupancyExcluding(db, listing.id, { stayId: convo.keysStay.id });
    if (!isRangeAvailable(listing, from, to, occ)) {
      throw new DateChangeError("UNAVAILABLE", "Those dates aren't available for this home.");
    }
    return;
  }
  if (convo.proposal) {
    if (!convo.proposal.agreement) {
      throw new DateChangeError("NOT_ACCEPTED", "Date changes apply to accepted swaps — use a counter-offer otherwise.");
    }
    const agreementId = convo.proposal.agreement.id;
    const [l1, l2] = await Promise.all([
      db.listing.findUnique({ where: { id: convo.proposal.proposerListingId }, select: LISTING_SLICE }),
      db.listing.findUnique({ where: { id: convo.proposal.targetListingId }, select: LISTING_SLICE }),
    ]);
    if (!l1 || !l2) throw new DateChangeError("NOT_FOUND", "A home in this swap no longer exists.");
    const [o1, o2] = await Promise.all([
      occupancyExcluding(db, l1.id, { agreementId }),
      occupancyExcluding(db, l2.id, { agreementId }),
    ]);
    if (!isRangeAvailable(l1, from, to, o1)) {
      throw new DateChangeError("UNAVAILABLE", "Those dates aren't open on your home.");
    }
    if (!isRangeAvailable(l2, from, to, o2)) {
      throw new DateChangeError("UNAVAILABLE", "Those dates aren't open on the other home.");
    }
    return;
  }
  throw new DateChangeError("NOT_FOUND", "Nothing to reschedule.");
}

// Accept or decline the pending change. Accept may only be done by the
// counterpart (not the proposer); decline may be done by either principal
// (the proposer declining = withdrawing). On accept the booking is moved.
export async function respondDateChange(
  conversationId: string,
  userId: string,
  accept: boolean,
): Promise<{ from: string; to: string } | null> {
  const convo = await loadContext(prisma, conversationId);
  if (!convo.pendingChangeFrom || !convo.pendingChangeTo || !convo.pendingChangeById) {
    throw new DateChangeError("NONE_PENDING", "There's no pending date change.");
  }
  const allowed = await principals(prisma, convo);
  if (!allowed.includes(userId)) throw new DateChangeError("FORBIDDEN", "Only the booking's parties can respond.");
  if (accept && userId === convo.pendingChangeById) {
    throw new DateChangeError("OWN_REQUEST", "You can't accept your own request.");
  }

  const from = convo.pendingChangeFrom;
  const to = convo.pendingChangeTo;

  if (!accept) {
    await prisma.conversation.update({ where: { id: conversationId }, data: clearPending });
    await recordEvent(conversationId, "change_declined", { from: from.toISOString(), to: to.toISOString() });
    return null;
  }

  // Apply atomically with a re-check inside the transaction (serializable so a
  // concurrent booking can't slip into the same range between check and write).
  await prisma.$transaction(
    async (tx) => {
      const fresh = await loadContext(tx, conversationId);
      await assertAvailable(tx, fresh, from, to);
      if (fresh.keysStay) await applyStayChange(tx, fresh.keysStay, from, to);
      else if (fresh.proposal?.agreement) await applySwapChange(tx, fresh.proposal, fresh.proposal.agreement, from, to);
      await tx.conversation.update({ where: { id: conversationId }, data: clearPending });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordEvent(conversationId, "change_accepted", { from: from.toISOString(), to: to.toISOString() });
  return { from: from.toISOString(), to: to.toISOString() };
}

const clearPending = {
  pendingChangeFrom: null,
  pendingChangeTo: null,
  pendingChangeById: null,
  pendingChangeAt: null,
};

// Move an accepted swap: update the agreement (authoritative) + the proposal
// (kept in sync), and re-point both homes' occupancy rows to the new range.
async function applySwapChange(
  tx: Prisma.TransactionClient,
  proposal: { id: string; proposerListingId: string; targetListingId: string },
  agreement: { id: string },
  from: Date,
  to: Date,
): Promise<void> {
  await tx.swapAgreement.update({ where: { id: agreement.id }, data: { dateFrom: from, dateTo: to } });
  await tx.swapProposal.update({ where: { id: proposal.id }, data: { dateFrom: from, dateTo: to } });
  for (const listingId of [proposal.proposerListingId, proposal.targetListingId]) {
    await releaseListingOccupancy(tx, { source: "swap_agreement", sourceId: agreement.id, listingId });
    await occupyListing(tx, { listingId, source: "swap_agreement", sourceId: agreement.id, dateFrom: from, dateTo: to });
  }
}

// Move a Keys stay: recompute nights + cost, settle the Keys delta (only for a
// confirmed stay — a pending one just re-holds), and re-point occupancy.
async function applyStayChange(
  tx: Prisma.TransactionClient,
  stay: { id: string; guestId: string; hostId: string; listingId: string; status: string; kind: string; nights: number; keysCost: number; listing: { sleeps: number; sizeSqm: number; city: string; isVerified: boolean } },
  from: Date,
  to: Date,
): Promise<void> {
  const newNights = nightsBetween(from, to);
  const newCost = stay.kind === "couchsurf" ? 0 : keysCostFor(nightlyKeysFor(stay.listing), newNights);
  const oldCost = stay.keysCost;
  const delta = newCost - oldCost;

  await tx.keysStay.update({
    where: { id: stay.id },
    data: { dateFrom: from, dateTo: to, nights: newNights, keysCost: newCost },
  });

  if (stay.kind !== "couchsurf" && delta !== 0) {
    if (stay.status === "pending") {
      // Held-but-not-spent: adjust the hold to match the new cost.
      if (delta > 0) await hold(stay.guestId, delta, { stayId: stay.id, note: "Date change — extra hold" }, tx);
      else await release(stay.guestId, -delta, { stayId: stay.id, note: "Date change — release" }, tx);
    } else if (stay.status === "confirmed") {
      // Already settled: charge/refund the guest and adjust the host's earnings.
      if (delta > 0) {
        await spend(stay.guestId, delta, { stayId: stay.id, note: "Date change — extra nights" }, tx);
        await earn(stay.hostId, delta, { stayId: stay.id, note: "Date change — extra nights" }, tx);
      } else {
        await refund(stay.guestId, -delta, { stayId: stay.id, note: "Date change — fewer nights" }, tx);
        // Un-earn the host (negative earn_host correction); fails if they've
        // already spent it (NEGATIVE_BALANCE), which correctly blocks the change.
        await applyTransaction(
          { userId: stay.hostId, delta, kind: "earn_host", stayId: stay.id, note: "Date change — fewer nights" },
          tx,
        );
      }
    }
  }

  await releaseListingOccupancy(tx, { source: "keys_stay", sourceId: stay.id });
  await occupyListing(tx, { listingId: stay.listingId, source: "keys_stay", sourceId: stay.id, dateFrom: from, dateTo: to });
}

// Serialized view of the pending change for the timeline response. `mine` =
// the viewer is the one who proposed it (so the UI shows "waiting" vs the
// Accept/Decline actions).
export type PendingChangeDTO = {
  from: string;
  to: string;
  requestedById: string;
  mine: boolean;
  at: string | null;
};

export function pendingChangeDTO(
  convo: { pendingChangeFrom: Date | null; pendingChangeTo: Date | null; pendingChangeById: string | null; pendingChangeAt: Date | null },
  viewerId: string,
): PendingChangeDTO | null {
  if (!convo.pendingChangeFrom || !convo.pendingChangeTo || !convo.pendingChangeById) return null;
  return {
    from: convo.pendingChangeFrom.toISOString(),
    to: convo.pendingChangeTo.toISOString(),
    requestedById: convo.pendingChangeById,
    mine: convo.pendingChangeById === viewerId,
    at: convo.pendingChangeAt?.toISOString() ?? null,
  };
}
