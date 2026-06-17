// Swapalitics — playful per-user travel + impact stats. Computed live from
// agreements, referrals and reviews (no extra tables). The platform is small
// pre-launch, so the leaderboard pass over all completed agreements is cheap;
// revisit with a materialized aggregate if this gets hot.

import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
// "Early adopter" = among the first N accounts by join order.
const EARLY_ADOPTER_CUTOFF = 1000;

function nightsBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

export type SwapaliticsBadge = {
  key: string;
  label: string;
  description: string;
  icon: string; // SF Symbol name
  earned: boolean;
};

export type Swapalitics = {
  nightsAbroad: number;       // completed swap nights (you, travelling)
  nightsUpcoming: number;     // booked but not yet completed
  nightsHosted: number;       // nights you hosted someone
  swapsCompleted: number;
  citiesVisited: number;
  countriesVisited: number;
  // Real days abroad from daily location tracking (home = the country with the
  // most tracked days). nightsAbroad above is the slice of that spent on swaps.
  daysTracked: number;
  daysAbroad: number;
  homeCountry: string | null;
  topCountries: Array<{ country: string; days: number }>;
  // Share of your abroad-days that were home swaps (nights ÷ days abroad).
  pctViaSwapl: number;
  // Community comparison.
  rank: number;               // 1 = most nights abroad
  totalTravellers: number;    // users with >= 1 completed night
  percentile: number;         // "top X%"
  avgNightsAllUsers: number;
  // Impact / engagement.
  peopleConnected: number;    // distinct swap partners
  referralsJoined: number;    // people you brought in
  reviewsWritten: number;
  joinRank: number;           // your account number by join order
  badges: SwapaliticsBadge[];
};

export async function computeSwapalitics(userId: string): Promise<Swapalitics> {
  const [mine, allCompleted, me, referralsJoined, reviewsWritten, totalUsers, locationDays] = await Promise.all([
    prisma.swapAgreement.findMany({
      where: { OR: [{ listing1: { userId } }, { listing2: { userId } }] },
      select: {
        status: true,
        dateFrom: true,
        dateTo: true,
        listing1: { select: { userId: true, city: true, country: true } },
        listing2: { select: { userId: true, city: true, country: true } },
      },
    }),
    prisma.swapAgreement.findMany({
      where: { status: "COMPLETED" },
      select: {
        dateFrom: true,
        dateTo: true,
        listing1: { select: { userId: true } },
        listing2: { select: { userId: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.referral.count({ where: { ownerId: userId, status: { in: ["qualified", "rewarded"] } } }),
    prisma.swapReview.count({ where: { authorId: userId } }),
    prisma.user.count(),
    prisma.userLocationDay.findMany({ where: { userId }, select: { countryCode: true } }),
  ]);

  // Days-abroad from real daily location: "home" is wherever you spend most days.
  const daysByCountry = new Map<string, number>();
  for (const d of locationDays) {
    if (d.countryCode) daysByCountry.set(d.countryCode, (daysByCountry.get(d.countryCode) ?? 0) + 1);
  }
  const daysTracked = [...daysByCountry.values()].reduce((s, v) => s + v, 0);
  let homeCountry: string | null = null;
  let homeDays = 0;
  for (const [c, n] of daysByCountry) {
    if (n > homeDays) { homeDays = n; homeCountry = c; }
  }
  const daysAbroad = daysTracked - homeDays;
  const topCountries = [...daysByCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([country, days]) => ({ country, days }));

  let nightsAbroad = 0;
  let nightsUpcoming = 0;
  let nightsHosted = 0;
  let swapsCompleted = 0;
  const cities = new Set<string>();
  const countries = new Set<string>();
  const partners = new Set<string>();

  for (const a of mine) {
    const nights = nightsBetween(a.dateFrom, a.dateTo);
    const theirs = a.listing1.userId === userId ? a.listing2 : a.listing1;
    partners.add(theirs.userId);
    if (a.status === "COMPLETED") {
      nightsAbroad += nights;     // both parties travel for the same window
      nightsHosted += nights;     // and both host
      swapsCompleted += 1;
      cities.add(theirs.city);
      countries.add(theirs.country);
    } else if (a.status === "ACTIVE") {
      nightsUpcoming += nights;
    }
  }

  // Leaderboard by completed nights abroad.
  const nightsByUser = new Map<string, number>();
  for (const a of allCompleted) {
    const n = nightsBetween(a.dateFrom, a.dateTo);
    for (const uid of [a.listing1.userId, a.listing2.userId]) {
      nightsByUser.set(uid, (nightsByUser.get(uid) ?? 0) + n);
    }
  }
  const totalTravellers = nightsByUser.size;
  const ahead = [...nightsByUser.values()].filter((v) => v > nightsAbroad).length;
  const rank = ahead + 1;
  const percentile = totalTravellers > 0 ? Math.max(1, Math.round((1 - ahead / totalTravellers) * 100)) : 0;
  const totalNights = [...nightsByUser.values()].reduce((s, v) => s + v, 0);
  const avgNightsAllUsers = totalTravellers > 0 ? Math.round(totalNights / totalTravellers) : 0;

  const earlierUsers = me
    ? await prisma.user.count({ where: { createdAt: { lt: me.createdAt } } })
    : totalUsers;
  const joinRank = earlierUsers + 1;

  const badges: SwapaliticsBadge[] = [
    {
      key: "early_adopter",
      label: "Early adopter",
      description: `One of the first ${EARLY_ADOPTER_CUTOFF} swaplers`,
      icon: "sparkles",
      earned: joinRank <= EARLY_ADOPTER_CUTOFF,
    },
    {
      key: "first_swap",
      label: "First swap",
      description: "Completed your first home swap",
      icon: "house.fill",
      earned: swapsCompleted >= 1,
    },
    {
      key: "swambassador",
      label: "Swambassador",
      description: "Brought 3+ friends onto Swapl",
      icon: "person.2.fill",
      earned: referralsJoined >= 3,
    },
    {
      key: "globetrotter",
      label: "Globetrotter",
      description: "Swapped in 3+ countries",
      icon: "globe.europe.africa.fill",
      earned: countries.size >= 3,
    },
    {
      key: "super_host",
      label: "Super host",
      description: "Hosted 5+ completed swaps",
      icon: "key.fill",
      earned: swapsCompleted >= 5,
    },
    {
      key: "storyteller",
      label: "Storyteller",
      description: "Wrote 3+ reviews",
      icon: "text.bubble.fill",
      earned: reviewsWritten >= 3,
    },
    {
      key: "centurion",
      label: "Centurion",
      description: "100+ nights swapped",
      icon: "flame.fill",
      earned: nightsAbroad >= 100,
    },
    {
      key: "podium",
      label: "Top traveller",
      description: "Top 3 on the nights leaderboard",
      icon: "trophy.fill",
      earned: rank <= 3 && nightsAbroad > 0,
    },
  ];

  return {
    nightsAbroad,
    nightsUpcoming,
    nightsHosted,
    swapsCompleted,
    citiesVisited: cities.size,
    countriesVisited: countries.size,
    daysTracked,
    daysAbroad,
    homeCountry,
    topCountries,
    // % of your abroad-days spent on swaps. Falls back to 100% when we have no
    // location history yet but you've completed swaps.
    pctViaSwapl: daysAbroad > 0
      ? Math.min(100, Math.round((nightsAbroad / daysAbroad) * 100))
      : (nightsAbroad > 0 ? 100 : 0),
    rank,
    totalTravellers,
    percentile,
    avgNightsAllUsers,
    peopleConnected: partners.size,
    referralsJoined,
    reviewsWritten,
    joinRank,
    badges,
  };
}
