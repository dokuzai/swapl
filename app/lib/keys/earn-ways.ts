// "Ways to earn Keys" surface (DOK-164) — a server-owned catalogue of the
// actions that mint Keys, each with the founder-set amount, whether it's a
// one-time or repeatable earn, and (per user) whether they've already done it.
//
// This is the single source of truth the wallet + a future "earn Keys" UI read,
// so the list can't drift from the actual ledger hooks. It is server-only (reads
// prisma); the client consumes the DTO via @/lib/keys/earn-ways-dto.

import { prisma } from "@/lib/db";
import {
  WELCOME_BONUS_KEYS,
  EARN_PROPERTY_VERIFIED_KEYS,
  EARN_REVIEW_KEYS,
  EARN_SHARE_CONVERTED_KEYS,
  EARN_LISTING_COMPLETE_KEYS,
} from "@/lib/keys/config";
import { REFERRAL_REWARD_KEYS } from "@/lib/growth/config";
import type { EarnWay, EarnWaysPayload } from "@/lib/keys/earn-ways-dto";

// Static catalogue (order = display order). `key` is stable for the client.
// `repeatable` actions never show as "done"; `done` reflects whether the user
// has the ledger row / state at least once. `gatedOnIdentity` flags the bonuses
// that require identity verification (everything except the identity bonus
// itself, which IS the verification reward).
const CATALOGUE: ReadonlyArray<Omit<EarnWay, "done">> = [
  {
    key: "verify_identity",
    amount: WELCOME_BONUS_KEYS,
    repeatable: false,
    gatedOnIdentity: false,
    kind: "welcome_bonus",
  },
  {
    key: "verify_property",
    amount: EARN_PROPERTY_VERIFIED_KEYS,
    repeatable: true,
    gatedOnIdentity: true,
    kind: "earn_property_verified",
  },
  {
    key: "complete_listing",
    amount: EARN_LISTING_COMPLETE_KEYS,
    repeatable: true,
    gatedOnIdentity: true,
    kind: "earn_listing_complete",
  },
  {
    key: "leave_review",
    amount: EARN_REVIEW_KEYS,
    repeatable: true,
    gatedOnIdentity: true,
    kind: "earn_review",
  },
  {
    key: "share_converted",
    amount: EARN_SHARE_CONVERTED_KEYS,
    repeatable: true,
    gatedOnIdentity: true,
    kind: "earn_share_converted",
  },
  {
    key: "refer_friend",
    amount: REFERRAL_REWARD_KEYS,
    repeatable: true,
    gatedOnIdentity: true,
    kind: "referral_bonus",
  },
];

/**
 * Build the per-user "ways to earn" payload: the catalogue with a `done` flag
 * (has the user earned this kind at least once) plus the identity-gate status,
 * so the UI can grey out gated rows for an unverified user.
 */
export async function earnWaysFor(userId: string): Promise<EarnWaysPayload> {
  const [user, kinds] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { verified: true } }),
    prisma.keysTransaction.groupBy({
      by: ["kind"],
      where: { userId, kind: { in: CATALOGUE.map((c) => c.kind) } },
      _count: { _all: true },
    }),
  ]);

  const earnedKinds = new Set(kinds.map((k) => k.kind));
  const identityVerified = Boolean(user?.verified);

  return {
    identityVerified,
    ways: CATALOGUE.map((c) => ({
      ...c,
      done: earnedKinds.has(c.kind),
    })),
  };
}
