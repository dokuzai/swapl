// Growth engine core (DOK-157) — referral codes, attribution, and the
// qualification hook that credits Keys to BOTH sides when an invitee verifies.
//
// BINDING PRINCIPLES:
//   - Referrals earn KEYS, never money.
//   - ANTI-FARM: a referral's two-sided Keys reward is credited ONLY when the
//     invitee verifies their identity (the qualifying action), exactly once per
//     Referral (rewardedAt guard), and under daily/monthly caps on the referrer.
//   - The first attribution wins: a user can be the referee of at most one
//     Referral (enforced by the unique refereeId).

import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { normaliseEmail } from "@/lib/auth/tokens";
import { applyTransaction } from "@/lib/keys/ledger";
import {
  REFERRAL_REWARD_KEYS,
  REFERRAL_REFEREE_KEYS,
  REFERRAL_DAILY_CAP,
  REFERRAL_MONTHLY_CAP,
  type ReferralSource,
} from "@/lib/growth/config";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Unambiguous alphabet (no 0/O/1/I/L) for a short, human-shareable code.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Return the user's referral code, minting one lazily on first use. Safe under
 * concurrency: a unique-constraint collision (race or duplicate code) is
 * retried; if the row already gained a code meanwhile, that code is returned.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch {
      // Unique collision on referralCode (code already taken, or the row was
      // updated concurrently). Re-read: if it now has a code, use it; else retry.
      const reread = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (reread?.referralCode) return reread.referralCode;
    }
  }
  throw new Error("Could not mint a unique referral code");
}

/** The shareable ?ref= link for a code. */
export function referralShareUrl(code: string): string {
  return `${APP_URL}/?ref=${encodeURIComponent(code)}`;
}

/** The shareable invite-to-stay link for a token. */
export function inviteShareUrl(token: string): string {
  return `${APP_URL}/?invite=${encodeURIComponent(token)}`;
}

/** Opaque, URL-safe token for an invite-to-stay link. */
export function newInviteToken(): string {
  return createHash("sha256").update(randomBytes(24)).digest("base64url").slice(0, 24);
}

/**
 * Record signup attribution from a plain ?ref=CODE link. Idempotent and safe:
 *   - no-ops if the code is unknown, is the user's own code, or the user is
 *     already attributed (unique refereeId);
 *   - creates a `pending` Referral owned by the code's owner, linked to the
 *     new referee.
 * Returns the created Referral id, or null when nothing was recorded.
 */
export async function attributeSignupByCode(
  refereeUserId: string,
  code: string,
): Promise<string | null> {
  const owner = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!owner || owner.id === refereeUserId) return null;

  // First attribution wins — bail if this user is already a referee.
  const already = await prisma.referral.findUnique({
    where: { refereeId: refereeUserId },
    select: { id: true },
  });
  if (already) return null;

  try {
    const row = await prisma.referral.create({
      data: {
        ownerId: owner.id,
        refereeId: refereeUserId,
        source: "link" satisfies ReferralSource,
        status: "pending",
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    // Lost a race on the unique refereeId — someone else attributed first.
    return null;
  }
}

/**
 * Link a freshly-created account to any pending invite-to-stay / email-keyed
 * referral rows that named this email but had no refereeId yet. The first such
 * row (oldest) wins the attribution; the rest are left untouched. No-op if the
 * user is already a referee. Returns the linked Referral id, or null.
 */
export async function linkRefereeByEmail(
  refereeUserId: string,
  email: string,
): Promise<string | null> {
  const normalised = normaliseEmail(email);

  const already = await prisma.referral.findUnique({
    where: { refereeId: refereeUserId },
    select: { id: true },
  });
  if (already) return null;

  const pending = await prisma.referral.findFirst({
    where: { refereeEmail: normalised, refereeId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, ownerId: true },
  });
  if (!pending || pending.ownerId === refereeUserId) return null;

  try {
    await prisma.referral.update({
      where: { id: pending.id },
      data: { refereeId: refereeUserId },
    });
    return pending.id;
  } catch {
    return null;
  }
}

/**
 * Link a freshly-created account to an open invite-to-stay link (?invite=TOKEN).
 * The token's Referral gains this user as referee, unless it's already claimed,
 * is the user's own invite, or the user is already attributed elsewhere.
 * Returns the linked Referral id, or null.
 */
export async function linkRefereeByInviteToken(
  refereeUserId: string,
  token: string,
): Promise<string | null> {
  const already = await prisma.referral.findUnique({
    where: { refereeId: refereeUserId },
    select: { id: true },
  });
  if (already) return null;

  const invite = await prisma.referral.findUnique({
    where: { token },
    select: { id: true, ownerId: true, refereeId: true },
  });
  if (!invite || invite.refereeId || invite.ownerId === refereeUserId) return null;

  try {
    await prisma.referral.update({
      where: { id: invite.id },
      data: { refereeId: refereeUserId },
    });
    return invite.id;
  } catch {
    return null;
  }
}

// Count of referrals THIS owner has already had REWARDED since `since` — the
// magnitude of the anti-farm cap (one rewarded referral = one unit).
async function rewardedReferralsSince(ownerId: string, since: Date): Promise<number> {
  return prisma.referral.count({
    where: { ownerId, rewardedAt: { gte: since } },
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

export type QualifyResult = {
  qualified: number; // referrals moved pending -> qualified
  rewarded: number; // referrals that also paid out Keys (within caps)
  // Keys credited to the REFEREE (the newly-verified user) across the
  // referrals that paid out — drives the post-verify "you earned Keys" toast.
  // 0 when nothing qualified or every match was capped.
  refereeKeys: number;
  // Display name (or null) of the referrer who invited them, for the toast
  // copy ("invited by …"). The first rewarded referral wins.
  referrerName: string | null;
};

// Read-back of the referee-side reward for a now-verified user, derived purely
// from persisted state (Referral.status === "rewarded"). Idempotent and safe to
// call on every status poll, so the toast survives the webhook path (where the
// qualify hook ran in a different request than the client's status fetch).
export type RefereeReward = {
  keys: number;
  referrerName: string | null;
};

export async function refereeRewardFor(refereeUserId: string): Promise<RefereeReward | null> {
  const rewarded = await prisma.referral.findFirst({
    where: { refereeId: refereeUserId, status: "rewarded" },
    orderBy: { rewardedAt: "desc" },
    include: { owner: { select: { name: true } } },
  });
  if (!rewarded) return null;
  return { keys: REFERRAL_REFEREE_KEYS, referrerName: rewarded.owner?.name ?? null };
}

/**
 * THE QUALIFICATION HOOK. Called when `refereeUserId` performs the qualifying
 * action (identity verification). Marks every pending Referral where they are
 * the referee as `qualified`, then — anti-farm — credits Keys to BOTH sides
 * exactly once per Referral, subject to the referrer's rolling daily/monthly
 * caps. A capped referral stays `qualified` (counts toward waitlist /
 * leaderboard) but pays no Keys.
 *
 * Idempotent: the `rewardedAt` stamp guards the payout, and only `pending` rows
 * are picked up, so a replayed verification is a no-op. Best-effort by design —
 * the caller (verification flow) must not fail if this throws.
 */
export async function qualifyReferralsForReferee(
  refereeUserId: string,
): Promise<QualifyResult> {
  // A user is the referee of at most one Referral (unique refereeId), but we
  // query defensively as a list.
  const pendings = await prisma.referral.findMany({
    where: { refereeId: refereeUserId, status: "pending" },
  });
  if (pendings.length === 0)
    return { qualified: 0, rewarded: 0, refereeKeys: 0, referrerName: null };

  const now = Date.now();
  let qualified = 0;
  let refereeKeys = 0;
  let referrerName: string | null = null;
  let rewarded = 0;

  for (const ref of pendings) {
    // Per-referral atomic transition + two-sided payout.
    const result = await prisma.$transaction(async (tx) => {
      // Re-read inside the tx and guard on status so concurrent calls can't
      // double-process the same referral.
      const fresh = await tx.referral.findUnique({ where: { id: ref.id } });
      if (!fresh || fresh.status !== "pending")
        return { q: false, r: false, ownerName: null as string | null };

      const qualifiedAt = new Date();

      // Anti-farm caps measured against THIS owner's recently-rewarded count.
      const [dayCount, monthCount] = await Promise.all([
        rewardedReferralsSince(fresh.ownerId, new Date(now - DAY_MS)),
        rewardedReferralsSince(fresh.ownerId, new Date(now - MONTH_MS)),
      ]);
      const underCap = dayCount < REFERRAL_DAILY_CAP && monthCount < REFERRAL_MONTHLY_CAP;

      if (underCap) {
        // Two-sided Keys reward, both rows in the same transaction as the
        // status flip — all-or-nothing.
        await applyTransaction(
          {
            userId: fresh.ownerId,
            delta: REFERRAL_REWARD_KEYS,
            kind: "referral_bonus",
            note: `Referral qualified (${fresh.source})`,
          },
          tx as unknown as Prisma.TransactionClient,
        );
        await applyTransaction(
          {
            userId: refereeUserId,
            delta: REFERRAL_REFEREE_KEYS,
            kind: "invite_bonus",
            note: "Welcome — invited to swapl",
          },
          tx as unknown as Prisma.TransactionClient,
        );
        await tx.referral.update({
          where: { id: fresh.id },
          data: { status: "rewarded", qualifiedAt, rewardedAt: qualifiedAt },
        });
        const owner = await tx.user.findUnique({
          where: { id: fresh.ownerId },
          select: { name: true },
        });
        return { q: true, r: true, ownerName: (owner?.name ?? null) as string | null };
      }

      // Over cap: qualified (waitlist/leaderboard move) but no Keys.
      await tx.referral.update({
        where: { id: fresh.id },
        data: { status: "qualified", qualifiedAt },
      });
      return { q: true, r: false, ownerName: null as string | null };
    });

    if (result.q) qualified++;
    if (result.r) {
      rewarded++;
      refereeKeys += REFERRAL_REFEREE_KEYS;
      if (referrerName === null) referrerName = result.ownerName;
    }
  }

  return { qualified, rewarded, refereeKeys, referrerName };
}
