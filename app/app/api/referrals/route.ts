import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import { ensureReferralCode, referralShareUrl } from "@/lib/growth/referrals";
import {
  currentTier,
  nextTier,
  waitlistPosition,
  REFERRAL_REWARD_KEYS,
} from "@/lib/growth/config";

// GET /api/referrals — the caller's growth dashboard (DOK-157).
//
// Returns the shareable code + link, the list of people invited (with status),
// the Keys earned from referrals, tier progress, the (FOMO-flavoured) waitlist
// position, and an anonymised leaderboard top — all derived from the number of
// QUALIFIED referrals, so bringing more people climbs the ladder.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const code = await ensureReferralCode(session.userId);

  const [referrals, keysAgg] = await Promise.all([
    prisma.referral.findMany({
      where: { ownerId: session.userId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        source: true,
        createdAt: true,
        referee: { select: { name: true } },
      },
    }),
    // Keys credited to this user specifically by the referral engine.
    prisma.keysTransaction.aggregate({
      where: { userId: session.userId, kind: "referral_bonus" },
      _sum: { delta: true },
    }),
  ]);

  const qualifiedCount = referrals.filter(
    (r) => r.status === "qualified" || r.status === "rewarded",
  ).length;

  const tier = currentTier(qualifiedCount);
  const next = nextTier(qualifiedCount);

  // Anonymised leaderboard: the top referrers by qualified-referral count.
  // Names are first-name-only (privacy) and the caller is flagged.
  const leaderboard = await buildLeaderboard(session.userId);

  return NextResponse.json({
    code,
    shareUrl: referralShareUrl(code),
    invitesSent: referrals.length,
    joined: referrals.map((r) => ({
      name: r.referee?.name ?? null,
      status: r.status,
      source: r.source,
    })),
    keysEarned: keysAgg._sum.delta ?? 0,
    qualifiedCount,
    rewardPerReferral: REFERRAL_REWARD_KEYS,
    tierProgress: {
      current: tier ? { key: tier.key, label: tier.label, perk: tier.perk } : null,
      next: next
        ? {
            key: next.key,
            label: next.label,
            threshold: next.threshold,
            remaining: Math.max(0, next.threshold - qualifiedCount),
          }
        : null,
    },
    waitlistPosition: waitlistPosition(qualifiedCount),
    leaderboardTop: leaderboard,
  });
}

// Top-10 referrers by qualified-referral count. SQLite-friendly: we group in
// the DB then resolve names. The caller's own row is flagged `isYou`.
async function buildLeaderboard(callerId: string) {
  const grouped = await prisma.referral.groupBy({
    by: ["ownerId"],
    where: { status: { in: ["qualified", "rewarded"] } },
    _count: { _all: true },
    orderBy: { _count: { ownerId: "desc" } },
    take: 10,
  });
  if (grouped.length === 0) return [];

  const owners = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.ownerId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(owners.map((u) => [u.id, u.name]));

  return grouped.map((g, i) => ({
    rank: i + 1,
    // First name only for privacy; null stays null.
    name: nameById.get(g.ownerId)?.split(" ")[0] ?? null,
    qualified: g._count._all,
    isYou: g.ownerId === callerId,
  }));
}
