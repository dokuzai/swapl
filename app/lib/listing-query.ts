import { prisma } from "@/lib/db";
import { type ListingDTO, toDTO } from "@/lib/listing-utils";
import { computeMatchScore } from "@/lib/match/score";
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
  const where: Record<string, unknown> = { isActive: true };
  if (filters.cities.length) where.city = { in: filters.cities };
  if (filters.propertyTypes.length) where.propertyType = { in: filters.propertyTypes };
  if (filters.minSqm > 30) where.sizeSqm = { gte: filters.minSqm };
  if (filters.minSleeps > 1) where.sleeps = { gte: filters.minSleeps };
  if (filters.petsRequired) where.petsAllowed = true;
  if (filters.wfhRequired) where.wfhSetup = true;
  if (filters.stepFreeRequired) where.stepFreeAccess = true;
  if (filters.dateFrom) where.availableTo = { gte: new Date(filters.dateFrom) };
  if (filters.dateTo) where.availableFrom = { lte: new Date(filters.dateTo) };

  // Hide the viewer's own listing from results.
  if (viewerListing) (where as { id?: unknown }).id = { not: viewerListing.id };

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

export async function getViewerListing(userId: string | undefined | null): Promise<ListingDTO | null> {
  if (!userId) return null;
  const l = await prisma.listing.findFirst({
    where: { userId, isActive: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return l ? toDTO(l) : null;
}
