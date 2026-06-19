// Keys earning hooks (DOK-164) — bonuses that MINT Keys when a user takes an
// action that ADDS supply/trust to the marketplace.
//
// BINDING PRINCIPLES (the spec calls these out as economic guardrails):
//   - MODEST: small founder-set amounts (lib/keys/config.ts), tied to actions
//     that add offer/trust, never to pure consumption.
//   - IDENTITY-GATED: only a verified user (User.verified) earns these — the
//     same anti-farm gate the referral engine uses (DOK-157).
//   - IDEMPOTENT: exactly one ledger row per real-world event, keyed by a
//     deterministic `eventKey` (KeysTransaction.eventKey is @unique), so a
//     replayed/retried event can never double-credit.
//   - CAPPED: a rolling-30d ceiling on the NUMBER of each bonus a user may
//     collect; past the cap the action still succeeds but mints no Keys.
//
// These never throw into the caller's critical path: every public hook is
// best-effort and returns a small result object the caller may ignore.

import { prisma } from "@/lib/db";
import { applyTransaction, type KeysKind } from "@/lib/keys/ledger";
import {
  EARN_PROPERTY_VERIFIED_KEYS,
  EARN_REVIEW_KEYS,
  EARN_SHARE_CONVERTED_KEYS,
  EARN_LISTING_COMPLETE_KEYS,
  EARN_PROPERTY_VERIFIED_CAP,
  EARN_REVIEW_CAP,
  EARN_SHARE_CONVERTED_CAP,
  EARN_LISTING_COMPLETE_CAP,
} from "@/lib/keys/config";
import { homeGuideComplete } from "@/lib/trip/phase";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// The earn kinds this module owns. Keeping the union narrow stops a caller
// accidentally routing a spend/hold through the bonus path.
export type EarnKind =
  | "earn_property_verified"
  | "earn_review"
  | "earn_share_converted"
  | "earn_listing_complete";

export type EarnOutcome =
  | { credited: true; amount: number; eventKey: string }
  | { credited: false; reason: "duplicate" | "unverified" | "capped"; eventKey: string };

type GrantArgs = {
  userId: string;
  kind: EarnKind;
  amount: number;
  cap: number;
  // Deterministic per-event key, e.g. `earn_review:<reviewId>`.
  eventKey: string;
  note?: string;
  stayId?: string | null;
};

/**
 * The single idempotent + gated + capped credit primitive behind every hook.
 *
 * Order of guards (cheap → authoritative):
 *   1) duplicate — an eventKey row already exists → no-op (idempotent replay).
 *   2) unverified — User.verified must be true (anti-farm gate). No-op if not.
 *   3) capped — already collected `cap` of this kind in the rolling 30d → no-op.
 *   4) credit — append exactly one ledger row carrying the eventKey.
 *
 * The unique constraint on eventKey is the ULTIMATE idempotency guard: if two
 * concurrent calls both pass the existence check, the second create throws P2002
 * and we resolve to { duplicate } instead of double-crediting.
 */
export async function grantEarnOnce(args: GrantArgs): Promise<EarnOutcome> {
  const { userId, kind, amount, cap, eventKey, note, stayId } = args;

  // 1) Fast idempotency check on the deterministic event key.
  const existing = await prisma.keysTransaction.findUnique({
    where: { eventKey },
    select: { id: true },
  });
  if (existing) return { credited: false, reason: "duplicate", eventKey };

  // 2) Identity gate — only verified users earn these bonuses.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { verified: true },
  });
  if (!user?.verified) return { credited: false, reason: "unverified", eventKey };

  // 3) Rolling-30d cap on the number of THIS kind already credited.
  const since = new Date(Date.now() - MONTH_MS);
  const collected = await prisma.keysTransaction.count({
    where: { userId, kind, createdAt: { gte: since } },
  });
  if (collected >= cap) return { credited: false, reason: "capped", eventKey };

  // 4) Credit exactly once. The unique eventKey makes a racing duplicate fail
  //    here (P2002) rather than mint twice.
  try {
    await applyTransaction({
      userId,
      delta: amount,
      kind: kind as KeysKind,
      eventKey,
      note: note ?? null,
      stayId: stayId ?? null,
    });
    return { credited: true, amount, eventKey };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { credited: false, reason: "duplicate", eventKey };
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

// ---------- HOOK 1: verified property ownership (+15) ----------

/**
 * Credit the owner once when their PropertyVerification is APPROVED (owner or
 * tenant — both are eligible-to-host private parties; business is never
 * approved). Idempotent per (user, listing); identity-gated; capped.
 */
export async function grantPropertyVerifiedBonus(args: {
  userId: string;
  listingId: string;
}): Promise<EarnOutcome> {
  return grantEarnOnce({
    userId: args.userId,
    kind: "earn_property_verified",
    amount: EARN_PROPERTY_VERIFIED_KEYS,
    cap: EARN_PROPERTY_VERIFIED_CAP,
    eventKey: `earn_property_verified:${args.listingId}:${args.userId}`,
    note: "Property ownership verified",
  });
}

// ---------- HOOK 2: review after a completed stay (+5) ----------

/**
 * Credit the author once when they leave a SwapReview (which the API only
 * permits after the agreement is COMPLETED). Idempotent per review.
 */
export async function grantReviewBonus(args: {
  authorId: string;
  reviewId: string;
}): Promise<EarnOutcome> {
  return grantEarnOnce({
    userId: args.authorId,
    kind: "earn_review",
    amount: EARN_REVIEW_KEYS,
    cap: EARN_REVIEW_CAP,
    eventKey: `earn_review:${args.reviewId}`,
    note: "Left a review after a stay",
  });
}

// ---------- HOOK 3: a shared listing that got booked (+15) ----------

/**
 * Record a share→conversion and credit the SHARER once. Called when a guest who
 * arrived via a share token actually books/swaps the shared listing. The
 * attribution row's `convertedAt`/`keysAwardedAt` plus the unique eventKey make
 * this idempotent; the sharer must be the attribution owner, must not be the
 * converter themselves, and is identity-gated + capped.
 *
 * `conversionRef` is the realising KeysStay/SwapAgreement id (audit + part of
 * the event key so distinct conversions of distinct listings never collide).
 */
export async function grantShareConvertedBonus(args: {
  attributionId: string;
  converterId: string;
  conversionRef: string;
}): Promise<EarnOutcome | { credited: false; reason: "no_attribution" | "self" | "already_converted"; eventKey: string }> {
  const attribution = await prisma.listingShareAttribution.findUnique({
    where: { id: args.attributionId },
    select: {
      id: true,
      sharerId: true,
      listingId: true,
      convertedById: true,
      keysAwardedAt: true,
    },
  });
  const eventKey = `earn_share_converted:${args.attributionId}`;
  if (!attribution) return { credited: false, reason: "no_attribution", eventKey };
  // A sharer can't earn off their own booking.
  if (attribution.sharerId === args.converterId) return { credited: false, reason: "self", eventKey };
  // Already awarded — idempotent no-op (the eventKey would also catch this).
  if (attribution.keysAwardedAt) return { credited: false, reason: "already_converted", eventKey };

  // Atomic stamp: only succeeds if convertedById is still null (first converter wins).
  const stampResult = await prisma.listingShareAttribution.updateMany({
    where: { id: attribution.id, convertedById: null },
    data: {
      convertedById: args.converterId,
      conversionRef: args.conversionRef,
      convertedAt: new Date(),
    },
  });
  if (stampResult.count === 0) {
    return { credited: false, reason: "already_converted", eventKey };
  }

  const outcome = await grantEarnOnce({
    userId: attribution.sharerId,
    kind: "earn_share_converted",
    amount: EARN_SHARE_CONVERTED_KEYS,
    cap: EARN_SHARE_CONVERTED_CAP,
    eventKey,
    note: "A listing you shared got booked",
  });

  // Stamp the award guard once Keys actually minted.
  if (outcome.credited) {
    await prisma.listingShareAttribution.update({
      where: { id: attribution.id },
      data: { keysAwardedAt: new Date() },
    });
  }
  return outcome;
}

// ---------- HOOK 4: complete published listing (+5) ----------

type GuideLike = Parameters<typeof homeGuideComplete>[0];

/**
 * Credit the owner once when a listing reaches the "complete" milestone:
 * published (isActive) AND owner-verified AND a complete home guide. Idempotent
 * per listing; identity-gated; capped. Safe to call on any of the three events
 * that can flip the last condition (publish, owner-verify approval, guide save)
 * — it only credits when ALL three hold and only once.
 */
export async function maybeGrantListingCompleteBonus(listingId: string): Promise<EarnOutcome | { credited: false; reason: "not_eligible"; eventKey: string }> {
  const eventKey = `earn_listing_complete:${listingId}`;
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      userId: true,
      isActive: true,
      ownerVerified: true,
      homeGuide: true,
    },
  });
  if (!listing) return { credited: false, reason: "not_eligible", eventKey };

  const guideComplete = homeGuideComplete(listing.homeGuide as GuideLike);
  if (!listing.isActive || !listing.ownerVerified || !guideComplete) {
    return { credited: false, reason: "not_eligible", eventKey };
  }

  return grantEarnOnce({
    userId: listing.userId,
    kind: "earn_listing_complete",
    amount: EARN_LISTING_COMPLETE_KEYS,
    cap: EARN_LISTING_COMPLETE_CAP,
    eventKey,
    note: "Listing published, verified & guide complete",
  });
}

// ---------- share token helpers ----------

/**
 * Ensure a stable share token exists for (listing, sharer), minting one lazily.
 * Re-sharing returns the same token so the attribution row is reused. Returns
 * the token. The sharer can't be the listing owner-sharing-to-self path here —
 * any user may share any listing; conversion just won't pay if sharer==booker.
 */
export async function ensureShareToken(listingId: string, sharerId: string): Promise<string> {
  const existing = await prisma.listingShareAttribution.findUnique({
    where: { listingId_sharerId: { listingId, sharerId } },
    select: { token: true },
  });
  if (existing) return existing.token;

  const { randomBytes } = await import("node:crypto");
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomBytes(12).toString("base64url");
    try {
      const row = await prisma.listingShareAttribution.create({
        data: { listingId, sharerId, token },
        select: { token: true },
      });
      return row.token;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const reread = await prisma.listingShareAttribution.findUnique({
        where: { listingId_sharerId: { listingId, sharerId } },
        select: { token: true },
      });
      if (reread) return reread.token;
    }
  }
  throw new Error("Could not mint a unique share token");
}

/**
 * Resolve a share token to its attribution row id for a given listing. Returns
 * null when the token is unknown or doesn't match the listing being booked
 * (defends against a token pasted onto the wrong listing).
 */
export async function resolveShareToken(
  token: string,
  listingId: string,
): Promise<{ attributionId: string; sharerId: string } | null> {
  const row = await prisma.listingShareAttribution.findUnique({
    where: { token },
    select: { id: true, sharerId: true, listingId: true },
  });
  if (!row || row.listingId !== listingId) return null;
  return { attributionId: row.id, sharerId: row.sharerId };
}
