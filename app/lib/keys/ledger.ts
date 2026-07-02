// Keys credit ledger (DOK-155) — centralized, non-crypto, append-only.
//
// The KeysTransaction table is the SOURCE OF TRUTH. User.keysBalance is a
// cached running sum kept in lockstep: every mutation here appends exactly one
// ledger row AND updates the cached balance inside a SINGLE Prisma transaction,
// so the two can never diverge. Balance can be rebuilt from the ledger at any
// time (see recomputeBalance).
//
// Guardrails:
//   - A debit can never drive a balance below zero (NEGATIVE_BALANCE).
//   - kinds are a closed set (KeysKind).
//   - Keys are travel points: no buying, no cashing out, no withdrawal — the
//     only peer transfer is the capped in-app gift (gift_sent/gift_received).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type KeysKind =
  | "earn_host"
  | "spend_stay"
  | "welcome_bonus"
  | "gift_sent"
  | "gift_received"
  | "refund"
  | "hold"
  | "release"
  // Growth engine (DOK-157): two-sided referral reward, credited once per
  // Referral when the invitee verifies. referral_bonus -> the referrer (owner);
  // invite_bonus -> the newly-verified invitee (referee).
  | "referral_bonus"
  | "invite_bonus"
  // Earning hooks (DOK-164): modest, identity-gated, idempotent, capped bonuses
  // credited when a user takes an action that ADDS supply/trust to the market.
  | "earn_property_verified"
  | "earn_review"
  | "earn_share_converted"
  | "earn_listing_complete";

export const KEYS_KINDS: readonly KeysKind[] = [
  "earn_host",
  "spend_stay",
  "welcome_bonus",
  "gift_sent",
  "gift_received",
  "refund",
  "hold",
  "release",
  "referral_bonus",
  "invite_bonus",
  "earn_property_verified",
  "earn_review",
  "earn_share_converted",
  "earn_listing_complete",
];

// Human-readable label per kind, server-owned so the wallet/ledger endpoints
// expose a sensible label for every row (clients may still localize). Kept here
// next to the closed KeysKind set so a new kind can't be added without a label.
export const KEYS_KIND_LABELS: Record<KeysKind, string> = {
  earn_host: "Hosted a Keys stay",
  spend_stay: "Stay with Keys",
  welcome_bonus: "Welcome bonus",
  gift_sent: "Gift sent",
  gift_received: "Gift received",
  refund: "Refund",
  hold: "Hold",
  release: "Hold released",
  referral_bonus: "Referral reward",
  invite_bonus: "Invite bonus",
  earn_property_verified: "Verified your property",
  earn_review: "Left a review",
  earn_share_converted: "Your share got booked",
  earn_listing_complete: "Completed a listing",
};

/** Label for a ledger kind, falling back to the raw kind for unknown values. */
export function keysKindLabel(kind: string): string {
  return KEYS_KIND_LABELS[kind as KeysKind] ?? kind;
}

// A Prisma transaction client OR the root client — every helper accepts a `tx`
// so callers can compose several ledger writes (e.g. spend + earn) atomically.
type Db = PrismaClient | Prisma.TransactionClient;

export class KeysLedgerError extends Error {
  constructor(
    public code: "NEGATIVE_BALANCE" | "NON_POSITIVE_AMOUNT" | "USER_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "KeysLedgerError";
  }
}

export type ApplyInput = {
  userId: string;
  delta: number; // signed: + credit, - debit
  kind: KeysKind;
  stayId?: string | null;
  note?: string | null;
  // Deterministic idempotency key (DOK-164). When set, a unique constraint on
  // KeysTransaction.eventKey guarantees the row is written at most once even
  // under concurrent/replayed events; see grantEarnOnce in lib/keys/earn.ts.
  eventKey?: string | null;
};

export type LedgerRow = {
  id: string;
  userId: string;
  delta: number;
  kind: string;
  balanceAfter: number;
  stayId: string | null;
  note: string | null;
  createdAt: Date;
};

// Core primitive: atomically read the current balance, apply the signed delta,
// reject if it would go negative, persist the new cached balance, and append
// the ledger row. MUST run inside a transaction; pass the tx client.
async function applyWithinTx(tx: Db, input: ApplyInput): Promise<LedgerRow> {
  // Atomic balance update using DB-level increment to avoid lost-update under
  // PostgreSQL READ COMMITTED. The DB computes the new balance, so concurrent
  // debits cannot both read the same stale value and both commit.
  const updated = await tx.user.update({
    where: { id: input.userId },
    data: { keysBalance: { increment: input.delta } },
  });
  if (updated.keysBalance < 0) {
    throw new KeysLedgerError(
      "NEGATIVE_BALANCE",
      `Insufficient Keys: debit of ${Math.abs(input.delta)} would bring balance below zero`,
    );
  }
  const balanceAfter = updated.keysBalance;

  const row = await tx.keysTransaction.create({
    data: {
      userId: input.userId,
      delta: input.delta,
      kind: input.kind,
      balanceAfter,
      stayId: input.stayId ?? null,
      note: input.note ?? null,
      eventKey: input.eventKey ?? null,
    },
  });

  return row;
}

/**
 * Apply one ledger transaction atomically. If a `tx` is supplied the write
 * joins the caller's transaction (so multiple ledger rows commit together);
 * otherwise a fresh transaction is opened for this single write.
 */
export async function applyTransaction(
  input: ApplyInput,
  tx?: Db,
): Promise<LedgerRow> {
  if (tx) return applyWithinTx(tx, input);
  return prisma.$transaction((t) => applyWithinTx(t, input));
}

// ---------- semantic helpers ----------
// Each wraps applyTransaction with the right sign + kind. `amount` is always a
// positive magnitude; the helper picks the sign. They accept an optional `tx`
// so the stay flow can compose them in one transaction.

// Optional metadata for a ledger write. `eventKey` opts the row into the
// KeysTransaction @unique idempotency guard so a duplicate credit/debit for the
// same logical event physically cannot be written.
type LedgerOpts = { stayId?: string | null; note?: string | null; eventKey?: string | null };

function assertPositive(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new KeysLedgerError("NON_POSITIVE_AMOUNT", `Amount must be a positive integer, got ${amount}`);
  }
}

/** Host earns Keys (credit). */
export function earn(
  userId: string,
  amount: number,
  opts: LedgerOpts = {},
  tx?: Db,
): Promise<LedgerRow> {
  assertPositive(amount);
  return applyTransaction({ userId, delta: amount, kind: "earn_host", ...opts }, tx);
}

/** Guest spends Keys on a confirmed stay (debit). */
export function spend(
  userId: string,
  amount: number,
  opts: LedgerOpts = {},
  tx?: Db,
): Promise<LedgerRow> {
  assertPositive(amount);
  return applyTransaction({ userId, delta: -amount, kind: "spend_stay", ...opts }, tx);
}

/** Hold Keys (debit) while a stay is pending — reversed on decline/cancel. */
export function hold(
  userId: string,
  amount: number,
  opts: LedgerOpts = {},
  tx?: Db,
): Promise<LedgerRow> {
  assertPositive(amount);
  return applyTransaction({ userId, delta: -amount, kind: "hold", ...opts }, tx);
}

/** Release previously-held Keys back to the guest (credit). */
export function release(
  userId: string,
  amount: number,
  opts: LedgerOpts = {},
  tx?: Db,
): Promise<LedgerRow> {
  assertPositive(amount);
  return applyTransaction({ userId, delta: amount, kind: "release", ...opts }, tx);
}

/** Refund Keys to a user (credit) — used on disputes. */
export function refund(
  userId: string,
  amount: number,
  opts: LedgerOpts = {},
  tx?: Db,
): Promise<LedgerRow> {
  assertPositive(amount);
  return applyTransaction({ userId, delta: amount, kind: "refund", ...opts }, tx);
}

/**
 * Transfer Keys as a gift between two users, atomically: debit the sender
 * (gift_sent) and credit the recipient (gift_received) in one transaction.
 * Caller is responsible for the verified-only + cap + rate-limit checks; this
 * primitive only enforces atomicity and no-negative-balance on the sender.
 */
export async function gift(
  fromUserId: string,
  toUserId: string,
  amount: number,
  note?: string | null,
  validate?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ sent: LedgerRow; received: LedgerRow }> {
  assertPositive(amount);
  return prisma.$transaction(async (tx) => {
    if (validate) await validate(tx);
    const sent = await applyWithinTx(tx, {
      userId: fromUserId,
      delta: -amount,
      kind: "gift_sent",
      note: note ?? `Gift to ${toUserId}`,
    });
    const received = await applyWithinTx(tx, {
      userId: toUserId,
      delta: amount,
      kind: "gift_received",
      note: note ?? `Gift from ${fromUserId}`,
    });
    return { sent, received };
  });
}

/**
 * Welcome bonus — idempotent. Grants `amount` Keys once per user; a second
 * call is a no-op (returns null) because a welcome_bonus row already exists.
 * Runs the existence check + grant in a single transaction to avoid a race
 * double-granting.
 */
export async function grantWelcomeBonus(
  userId: string,
  amount: number,
): Promise<LedgerRow | null> {
  assertPositive(amount);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.keysTransaction.findFirst({
      where: { userId, kind: "welcome_bonus" },
      select: { id: true },
    });
    if (existing) return null;
    return applyWithinTx(tx, {
      userId,
      delta: amount,
      kind: "welcome_bonus",
      note: "Welcome to swapl",
    });
  });
}

/**
 * Rebuild the cached balance from the ledger (sum of deltas) and write it back.
 * Not used on the hot path — a repair/audit tool. Returns the recomputed sum.
 */
export async function recomputeBalance(userId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const agg = await tx.keysTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const balance = agg._sum.delta ?? 0;
    await tx.user.update({ where: { id: userId }, data: { keysBalance: balance } });
    return balance;
  });
}
