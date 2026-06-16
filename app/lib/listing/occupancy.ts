import { Prisma } from "@/generated/prisma/client";

export const OCCUPANCY_SOURCES = ["swap_agreement", "keys_stay", "blocked_range"] as const;
export type ListingOccupancySource = (typeof OCCUPANCY_SOURCES)[number];

export class ListingDateOverlapError extends Error {
  constructor() {
    super("LISTING_DATES_TAKEN");
    this.name = "ListingDateOverlapError";
  }
}

export function isListingDateOverlapError(err: unknown): boolean {
  return err instanceof ListingDateOverlapError || isOccupancyConflictError(err);
}

export async function occupyListing(
  tx: Prisma.TransactionClient,
  args: {
    listingId: string;
    source: ListingOccupancySource;
    sourceId: string;
    dateFrom: Date;
    dateTo: Date;
  },
) {
  try {
    return await tx.listingOccupancy.create({ data: args });
  } catch (err) {
    if (isOccupancyConflictError(err)) throw new ListingDateOverlapError();
    throw err;
  }
}

export async function releaseListingOccupancy(
  tx: Prisma.TransactionClient,
  args: { source: ListingOccupancySource; sourceId: string; listingId?: string },
) {
  await tx.listingOccupancy.deleteMany({
    where: {
      source: args.source,
      sourceId: args.sourceId,
      ...(args.listingId ? { listingId: args.listingId } : {}),
    },
  });
}

function isOccupancyConflictError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: unknown; database_error?: unknown; constraint?: unknown } };
  if (e.code === "P2002" && String(e.meta?.target ?? "").includes("ListingOccupancy")) return true;
  if (e.code === "23P01") return true;
  const details = `${String(e.meta?.database_error ?? "")} ${String(e.meta?.constraint ?? "")}`;
  return details.includes("ListingOccupancy_no_overlap");
}
