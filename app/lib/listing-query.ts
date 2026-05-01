import { prisma } from "@/lib/db";
import { type ListingDTO, toDTO } from "@/lib/listing-utils";
import { computeMatchScore } from "@/lib/match/score";
import type { ListingFilters } from "@/lib/listing-filters";

const PAGE_SIZE = 12;

export type ListingWithScore = { listing: ListingDTO; matchScore: number | null };

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
    const total = pool.length;
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
      return { listing: dto, matchScore: score };
    });
    scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    return { items: scored.slice(skip, skip + PAGE_SIZE), total, pageSize: PAGE_SIZE, page: filters.page };
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
      take: PAGE_SIZE,
      skip,
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    items: rows.map((l) => ({ listing: toDTO(l), matchScore: null })),
    total,
    pageSize: PAGE_SIZE,
    page: filters.page,
  };
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
