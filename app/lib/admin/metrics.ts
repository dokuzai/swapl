// Aggregations behind /admin/metrics (DOK-135). Kept out of the page so the
// queries are unit-testable with a mocked prisma. Everything runs in one
// Promise.all and uses only Prisma query-builder calls (count/groupBy), so it
// works identically on SQLite (dev) and Postgres (prod).

import { prisma } from "@/lib/db";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export const ONLINE_WINDOW_MS = 15 * MIN;

export type TopUser = {
  id: string;
  name: string | null;
  email: string;
  listings: number;
  online: boolean;
  lastActiveAt: string | null; // ISO
};

export type CityRow = {
  city: string;
  listings: number;
  share: number; // 0..1 of total active listings
};

export type AdminMetrics = {
  now: { online: number; dau: number; wau: number; mau: number };
  users: {
    total: number;
    emailVerified: number;
    withActiveListing: number;
    new7d: number;
    new30d: number;
  };
  listingsPerUser: {
    distribution: { zero: number; one: number; two: number; threePlus: number };
    avgPerUserWithListing: number; // 0 when nobody has listings
    topUsers: TopUser[];
  };
  cities: { totalActiveListings: number; top: CityRow[] };
  engagement: {
    proposalsByStatus: Record<string, number>;
    proposalsTotal: number;
    proposalAcceptRate: number; // accepted / total, 0 when no proposals
    agreementsActive: number;
    agreementsCompleted: number;
    messagesTotal: number;
    messages7d: number;
    favoritesTotal: number;
    favorites7d: number;
    savedSearches: number;
  };
};

export async function getAdminMetrics(now: Date = new Date()): Promise<AdminMetrics> {
  const t = now.getTime();
  const online = new Date(t - ONLINE_WINDOW_MS);
  const d1 = new Date(t - DAY);
  const d7 = new Date(t - 7 * DAY);
  const d30 = new Date(t - 30 * DAY);

  const [
    onlineNow,
    dau,
    wau,
    mau,
    usersTotal,
    usersEmailVerified,
    usersWithActiveListing,
    usersNew7d,
    usersNew30d,
    listingsByUser,
    activeListingsByCity,
    activeListingsTotal,
    proposalsByStatus,
    agreementsActive,
    agreementsCompleted,
    messagesTotal,
    messages7d,
    favoritesTotal,
    favorites7d,
    savedSearches,
  ] = await Promise.all([
    prisma.user.count({ where: { lastActiveAt: { gte: online } } }),
    prisma.user.count({ where: { lastActiveAt: { gte: d1 } } }),
    prisma.user.count({ where: { lastActiveAt: { gte: d7 } } }),
    prisma.user.count({ where: { lastActiveAt: { gte: d30 } } }),
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { listings: { some: { isActive: true } } } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.listing.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.listing.groupBy({
      by: ["city"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { city: "desc" } },
      take: 15,
    }),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.swapProposal.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.swapAgreement.count({ where: { status: "ACTIVE" } }),
    prisma.swapAgreement.count({ where: { status: "COMPLETED" } }),
    prisma.swapMessage.count(),
    prisma.swapMessage.count({ where: { createdAt: { gte: d7 } } }),
    prisma.favorite.count(),
    prisma.favorite.count({ where: { createdAt: { gte: d7 } } }),
    prisma.savedSearch.count(),
  ]);

  // ---- listings-per-user distribution + top hosts ----
  const counts = listingsByUser.map((r) => r._count._all);
  const distribution = {
    zero: usersTotal - listingsByUser.length,
    one: counts.filter((c) => c === 1).length,
    two: counts.filter((c) => c === 2).length,
    threePlus: counts.filter((c) => c >= 3).length,
  };
  const listingsHeldTotal = counts.reduce((a, b) => a + b, 0);
  const avgPerUserWithListing =
    listingsByUser.length === 0 ? 0 : listingsHeldTotal / listingsByUser.length;

  const topRows = [...listingsByUser]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 10);
  const topUserRecords = topRows.length
    ? await prisma.user.findMany({
        where: { id: { in: topRows.map((r) => r.userId) } },
        select: { id: true, name: true, email: true, lastActiveAt: true },
      })
    : [];
  const userById = new Map(topUserRecords.map((u) => [u.id, u]));
  const topUsers: TopUser[] = topRows.map((r) => {
    const u = userById.get(r.userId);
    const lastActiveAt = u?.lastActiveAt ?? null;
    return {
      id: r.userId,
      name: u?.name ?? null,
      email: u?.email ?? r.userId,
      listings: r._count._all,
      online: lastActiveAt !== null && lastActiveAt.getTime() >= online.getTime(),
      lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    };
  });

  // ---- proposals ----
  const byStatus: Record<string, number> = {};
  let proposalsTotal = 0;
  for (const row of proposalsByStatus) {
    byStatus[row.status] = row._count._all;
    proposalsTotal += row._count._all;
  }
  const accepted = byStatus["ACCEPTED"] ?? 0;

  return {
    now: { online: onlineNow, dau, wau, mau },
    users: {
      total: usersTotal,
      emailVerified: usersEmailVerified,
      withActiveListing: usersWithActiveListing,
      new7d: usersNew7d,
      new30d: usersNew30d,
    },
    listingsPerUser: { distribution, avgPerUserWithListing, topUsers },
    cities: {
      totalActiveListings: activeListingsTotal,
      top: activeListingsByCity.map((r) => ({
        city: r.city,
        listings: r._count._all,
        share: activeListingsTotal === 0 ? 0 : r._count._all / activeListingsTotal,
      })),
    },
    engagement: {
      proposalsByStatus: byStatus,
      proposalsTotal,
      proposalAcceptRate: proposalsTotal === 0 ? 0 : accepted / proposalsTotal,
      agreementsActive: agreementsActive,
      agreementsCompleted: agreementsCompleted,
      messagesTotal,
      messages7d,
      favoritesTotal,
      favorites7d,
      savedSearches,
    },
  };
}
