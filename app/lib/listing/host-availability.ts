// Host-managed bookability (DOK-219).
//
// Listings are "closed by default": the host opens the periods they can actually
// host, lowering the risk of being booked when unavailable. Open/closed is stored
// as the COMPLEMENT — ListingBlockedRange rows cover the closed dates, so the rest
// of the published window is bookable. Both surfaces keep the ListingOccupancy
// ledger in sync via occupy/release, exactly like manual host blocks.

import { Prisma } from "@/generated/prisma/client";
import { occupyListing, releaseListingOccupancy } from "./occupancy";
import { subtractRanges, rangesOverlap, type DateRange } from "./availability";

/**
 * Make a brand-new listing closed-by-default: block everything in `window`
 * except `openRanges` (which the host chose to open at creation). With an empty
 * `openRanges` the whole window is blocked → nothing bookable until the host
 * opens dates. Assumes no pre-existing blocks/occupancy (creation time).
 */
export async function closeWindowExcept(
  tx: Prisma.TransactionClient,
  listingId: string,
  window: DateRange,
  openRanges: DateRange[],
): Promise<void> {
  for (const seg of subtractRanges(window, openRanges)) {
    const row = await tx.listingBlockedRange.create({
      data: { listingId, dateFrom: seg.dateFrom, dateTo: seg.dateTo, note: null },
    });
    await occupyListing(tx, {
      listingId,
      source: "blocked_range",
      sourceId: row.id,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
    });
  }
}

/**
 * Open `[open)` on an existing listing: remove that span from every overlapping
 * host block, splitting/trimming as needed. Real bookings (swaps, Keys stays)
 * live in separate occupancy rows and are untouched — opening never frees a date
 * that's genuinely booked.
 */
export async function openDateRange(
  tx: Prisma.TransactionClient,
  listingId: string,
  open: DateRange,
): Promise<void> {
  const blocks = await tx.listingBlockedRange.findMany({
    where: { listingId },
    select: { id: true, dateFrom: true, dateTo: true, note: true },
  });
  for (const b of blocks) {
    if (!rangesOverlap(open.dateFrom, open.dateTo, b.dateFrom, b.dateTo)) continue;
    await releaseListingOccupancy(tx, { source: "blocked_range", sourceId: b.id, listingId });
    await tx.listingBlockedRange.delete({ where: { id: b.id } });
    for (const seg of subtractRanges({ dateFrom: b.dateFrom, dateTo: b.dateTo }, [open])) {
      const row = await tx.listingBlockedRange.create({
        data: { listingId, dateFrom: seg.dateFrom, dateTo: seg.dateTo, note: b.note },
      });
      await occupyListing(tx, {
        listingId,
        source: "blocked_range",
        sourceId: row.id,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
      });
    }
  }
}
