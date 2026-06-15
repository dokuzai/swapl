import { prisma } from "@/lib/db";
import { type ListingDTO, toDTO } from "@/lib/listing-utils";
import { computeMatchScore } from "@/lib/match/score";
import { rangesOverlap } from "@/lib/listing/availability";
import type { ListingFilters } from "@/lib/listing-filters";

const PAGE_SIZE = 12;
const FEATURED_PER_CITY_CAP = 5;

export type ListingWithScore = {
  listing: ListingDTO;
  matchScore: number | null;
  band: "featured" | "verified" | "standard";
};

// Rank order: featured (within cap) > verified > standard. Within each band we
// use the caller-requested sort.
function rankBand(l: ListingDTO): ListingWithScore["band"] {
  if (l.isFeatured) return "featured";
  if (l.isVerified) return "verified";
  return "standard";
}

const BAND_WEIGHT: Record<ListingWithScore["band"], number> = {
  featured: 0,
  verified: 1,
  standard: 2,
};

export async function queryListings(
  filters: ListingFilters,
  viewerListing?: ListingDTO | null
): Promise<{ items: ListingWithScore[]; total: number; pageSize: number; page: number }> {
  // SQLite via Prisma — no JSON queries needed for our seed; build a where clause.
  // Moderation: listings owned by suspended users never surface in browse.
  const where: Record<string, unknown> = { isActive: true, user: { suspendedAt: null } };
  if (filters.cities.length) where.city = { in: filters.cities };
  if (filters.propertyTypes.length) where.propertyType = { in: filters.propertyTypes };
  if (filters.minSqm > 30) where.sizeSqm = { gte: filters.minSqm };
  if (filters.minSleeps > 1) where.sleeps = { gte: filters.minSleeps };
  if (filters.petsRequired) where.petsAllowed = true;
  if (filters.wfhRequired) where.wfhSetup = true;
  if (filters.stepFreeRequired) where.stepFreeAccess = true;
  // Date-filtered browse (DOK-159): when both from & to are given, the listing
  // must (a) publish a window that fully COVERS the requested range and (b) have
  // no occupied/blocked range overlapping it. (a) is expressed in SQL; (b) needs
  // the unified availability data, so we resolve the eligible ids in JS below and
  // constrain the query to them — keeps pagination + count correct in both
  // query branches. A lone from/to keeps the old loose window-overlap behaviour.
  const wantFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const wantTo = filters.dateTo ? new Date(filters.dateTo) : null;
  const dateFiltered = !!(wantFrom && wantTo);
  if (dateFiltered) {
    where.availableFrom = { lte: wantFrom };
    where.availableTo = { gte: wantTo };
    const eligibleIds = await availableListingIds(where, wantFrom!, wantTo!);
    (where as { id?: unknown }).id = { in: eligibleIds };
  } else {
    if (filters.dateFrom) where.availableTo = { gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.availableFrom = { lte: new Date(filters.dateTo) };
  }

  // Hide the viewer's own listing from results.
  if (viewerListing) {
    if (dateFiltered) {
      const ids = (where as { id?: { in: string[] } }).id?.in ?? [];
      (where as { id?: unknown }).id = { in: ids.filter((x) => x !== viewerListing.id) };
    } else {
      (where as { id?: unknown }).id = { not: viewerListing.id };
    }
  }

  const skip = (filters.page - 1) * PAGE_SIZE;

  // For sort by match we need to score in-memory; load up to a couple of pages worth and rank.
  if (filters.sort === "match" && viewerListing) {
    const pool = await prisma.listing.findMany({
      where,
      include: { user: { select: { name: true } } },
      take: PAGE_SIZE * 6,
    });
    const scored: ListingWithScore[] = pool.map((l) => {
      const dto = toDTO(l);
      const score = computeMatchScore(
        {
          sizeSqm: viewerListing.sizeSqm,
          sleeps: viewerListing.sleeps,
          availableFrom: new Date(viewerListing.availableFrom),
          availableTo: new Date(viewerListing.availableTo),
          petsAllowed: viewerListing.petsAllowed,
          wfhSetup: viewerListing.wfhSetup,
          stepFreeAccess: viewerListing.stepFreeAccess,
          city: viewerListing.city,
          neighbourhood: viewerListing.neighbourhood,
        },
        {
          sizeSqm: dto.sizeSqm,
          sleeps: dto.sleeps,
          availableFrom: new Date(dto.availableFrom),
          availableTo: new Date(dto.availableTo),
          petsAllowed: dto.petsAllowed,
          wfhSetup: dto.wfhSetup,
          stepFreeAccess: dto.stepFreeAccess,
          city: dto.city,
          neighbourhood: dto.neighbourhood,
        }
      );
      return { listing: dto, matchScore: score, band: rankBand(dto) };
    });

    const ranked = applyFeaturedCap(
      scored.sort((a, b) => {
        if (BAND_WEIGHT[a.band] !== BAND_WEIGHT[b.band]) return BAND_WEIGHT[a.band] - BAND_WEIGHT[b.band];
        return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      })
    );
    return { items: ranked.slice(skip, skip + PAGE_SIZE), total: ranked.length, pageSize: PAGE_SIZE, page: filters.page };
  }

  const orderBy: Record<string, "asc" | "desc"> =
    filters.sort === "size_desc"
      ? { sizeSqm: "desc" }
      : filters.sort === "size_asc"
        ? { sizeSqm: "asc" }
        : { createdAt: "desc" }; // default newest

  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy,
      take: PAGE_SIZE * 4,
      skip,
    }),
    prisma.listing.count({ where }),
  ]);

  // Apply the featured/verified band ordering on top of the primary sort.
  const ranked = applyFeaturedCap(
    rows.map((l) => {
      const dto = toDTO(l);
      return { listing: dto, matchScore: null, band: rankBand(dto) };
    })
  );

  return {
    items: ranked.slice(0, PAGE_SIZE).map((r) => ({ listing: r.listing, matchScore: r.matchScore, band: r.band })),
    total,
    pageSize: PAGE_SIZE,
    page: filters.page,
  };
}

// Caps featured slots at FEATURED_PER_CITY_CAP per city; the rest demote to
// verified or standard depending on their flags. After re-banding we
// re-stable-sort so demoted entries fall into their correct slot.
function applyFeaturedCap(items: ListingWithScore[]): ListingWithScore[] {
  const featuredByCity = new Map<string, number>();
  const adjusted: ListingWithScore[] = items.map((item) => {
    if (item.band !== "featured") return item;
    const used = featuredByCity.get(item.listing.city) ?? 0;
    if (used >= FEATURED_PER_CITY_CAP) {
      const fallback: ListingWithScore["band"] = item.listing.isVerified ? "verified" : "standard";
      return { ...item, band: fallback };
    }
    featuredByCity.set(item.listing.city, used + 1);
    return item;
  });
  return adjusted.sort((a, b) => {
    if (BAND_WEIGHT[a.band] !== BAND_WEIGHT[b.band]) return BAND_WEIGHT[a.band] - BAND_WEIGHT[b.band];
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });
}

// Resolve the listing ids that are genuinely free for [from, to): start from
// the candidates whose published window covers the range (the passed `where`
// already encodes that + the other filters), then drop any with an occupied or
// host-blocked range overlapping the requested dates. Occupied = ACTIVE swap
// agreement on either side, or pending/confirmed Keys stay. One batched query
// per source — no per-listing round-trips.
async function availableListingIds(
  where: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<string[]> {
  const candidates = await prisma.listing.findMany({ where, select: { id: true } });
  const ids = candidates.map((c) => c.id);
  if (ids.length === 0) return [];

  const [agreements, stays, blocks] = await Promise.all([
    prisma.swapAgreement.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ listing1Id: { in: ids } }, { listing2Id: { in: ids } }],
      },
      select: { listing1Id: true, listing2Id: true, dateFrom: true, dateTo: true },
    }),
    prisma.keysStay.findMany({
      where: { listingId: { in: ids }, status: { in: ["pending", "confirmed"] } },
      select: { listingId: true, dateFrom: true, dateTo: true },
    }),
    prisma.listingBlockedRange.findMany({
      where: { listingId: { in: ids } },
      select: { listingId: true, dateFrom: true, dateTo: true },
    }),
  ]);

  const occupied = new Set<string>();
  for (const a of agreements) {
    if (!rangesOverlap(from, to, a.dateFrom, a.dateTo)) continue;
    occupied.add(a.listing1Id);
    occupied.add(a.listing2Id);
  }
  for (const s of stays) {
    if (rangesOverlap(from, to, s.dateFrom, s.dateTo)) occupied.add(s.listingId);
  }
  for (const b of blocks) {
    if (rangesOverlap(from, to, b.dateFrom, b.dateTo)) occupied.add(b.listingId);
  }

  return ids.filter((id) => !occupied.has(id));
}

export async function getViewerListing(userId: string | undefined | null): Promise<ListingDTO | null> {
  if (!userId) return null;
  const l = await prisma.listing.findFirst({
    where: { userId, isActive: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return l ? toDTO(l) : null;
}
