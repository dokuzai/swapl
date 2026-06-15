// Personal Swapl "story" aggregation (DOK-158).
//
// Builds a single chronological timeline of everywhere a user has BEEN (trips)
// and everyone they have HOSTED, from two sources of completed exchanges:
//
//   1. SwapAgreement (status "COMPLETED") — a *mutual* home swap. In one swap
//      window the user is BOTH a guest (they stayed in the other party's home →
//      a "trip") AND a host (the other party stayed in theirs → a "hosting").
//      So one completed agreement yields TWO timeline events for each party.
//      This is the same swap-direction logic that powers the "Where I've been"
//      strip on the public profile (DOK-147, app/api/profiles/[id]); here we
//      keep both directions instead of only the visited (trip) side.
//
//   2. KeysStay (status "completed") — a one-way Keys stay. The guest gets a
//      "trip" (they stayed in the listing's city), the host gets a "hosting".
//
// Server-only: pulls @/lib/db (Prisma). Never import this from a "use client"
// module — import the StoryEvent / StoryCounts TYPES via `import type` instead,
// or read the shapes from the generated OpenAPI types. (DOK-163.)

import { prisma } from "@/lib/db";

export type StoryEventKind = "trip" | "hosting";

export type StoryEvent = {
  kind: StoryEventKind;
  city: string;
  country: string;
  dateFrom: string; // ISO 8601
  dateTo: string; // ISO 8601
  year: number; // derived from dateTo (when the stay ended)
  counterpartName?: string | null; // the other party's display name, if known
  listingTitle?: string | null; // title of the home that was stayed in
};

export type StoryCounts = {
  trips: number;
  hostings: number;
  cities: number; // distinct city|country across ALL events
  countries: number; // distinct country across ALL events
};

export type Story = {
  timeline: StoryEvent[];
  counts: StoryCounts;
};

/**
 * Aggregate the personal story for `userId`: a date-desc timeline of trips and
 * hostings drawn from COMPLETED swap agreements and completed Keys stays, plus
 * distinct city/country counts. Returns empty arrays + zeroed counts for a user
 * with no completed history.
 */
export async function buildStory(userId: string): Promise<Story> {
  const [agreements, keysStays] = await Promise.all([
    // Mutual swaps the user took part in (owner of either listing).
    prisma.swapAgreement.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ listing1: { userId } }, { listing2: { userId } }],
      },
      select: {
        dateFrom: true,
        dateTo: true,
        listing1: {
          select: { userId: true, title: true, city: true, country: true, user: { select: { name: true } } },
        },
        listing2: {
          select: { userId: true, title: true, city: true, country: true, user: { select: { name: true } } },
        },
      },
    }),
    // One-way Keys stays — as guest (trip) or as host (hosting).
    prisma.keysStay.findMany({
      where: {
        status: "completed",
        OR: [{ guestId: userId }, { hostId: userId }],
      },
      select: {
        dateFrom: true,
        dateTo: true,
        guestId: true,
        hostId: true,
        guest: { select: { name: true } },
        host: { select: { name: true } },
        listing: { select: { title: true, city: true, country: true } },
      },
    }),
  ]);

  const events: StoryEvent[] = [];

  for (const a of agreements) {
    const owns1 = a.listing1.userId === userId;
    const mine = owns1 ? a.listing1 : a.listing2;
    const theirs = owns1 ? a.listing2 : a.listing1;

    // Trip: the user stayed in the OTHER party's home.
    events.push(makeEvent("trip", a.dateFrom, a.dateTo, theirs.city, theirs.country, theirs.user?.name, theirs.title));
    // Hosting: the other party stayed in the user's home.
    events.push(makeEvent("hosting", a.dateFrom, a.dateTo, mine.city, mine.country, theirs.user?.name, mine.title));
  }

  for (const s of keysStays) {
    if (s.guestId === userId) {
      // Guest → trip, in the listing's city, hosted by the host.
      events.push(makeEvent("trip", s.dateFrom, s.dateTo, s.listing.city, s.listing.country, s.host?.name, s.listing.title));
    }
    if (s.hostId === userId) {
      // Host → hosting, in their listing's city, for the guest.
      events.push(makeEvent("hosting", s.dateFrom, s.dateTo, s.listing.city, s.listing.country, s.guest?.name, s.listing.title));
    }
  }

  // Newest first by end date, then by start date, for a stable order.
  events.sort((a, b) => {
    if (b.dateTo !== a.dateTo) return b.dateTo < a.dateTo ? -1 : 1;
    return b.dateFrom < a.dateFrom ? -1 : b.dateFrom > a.dateFrom ? 1 : 0;
  });

  const cityKeys = new Set<string>();
  const countryKeys = new Set<string>();
  let trips = 0;
  let hostings = 0;
  for (const e of events) {
    if (e.kind === "trip") trips++;
    else hostings++;
    cityKeys.add(`${e.city}|${e.country}`);
    countryKeys.add(e.country);
  }

  return {
    timeline: events,
    counts: { trips, hostings, cities: cityKeys.size, countries: countryKeys.size },
  };
}

function makeEvent(
  kind: StoryEventKind,
  dateFrom: Date,
  dateTo: Date,
  city: string,
  country: string,
  counterpartName: string | null | undefined,
  listingTitle: string | null | undefined,
): StoryEvent {
  return {
    kind,
    city,
    country,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    year: dateTo.getFullYear(),
    counterpartName: counterpartName ?? null,
    listingTitle: listingTitle ?? null,
  };
}
