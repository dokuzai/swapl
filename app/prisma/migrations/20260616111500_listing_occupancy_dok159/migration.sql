-- Authoritative occupancy ledger for availability writes.
-- SQLite-compatible; Postgres production must additionally run
-- scripts/apply-postgres-availability-constraints.ts to add the exclusion
-- constraint that prevents overlapping ranges at the database layer.

CREATE TABLE "ListingOccupancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dateFrom" DATETIME NOT NULL,
    "dateTo" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingOccupancy_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ListingOccupancy_source_sourceId_listingId_key" ON "ListingOccupancy"("source", "sourceId", "listingId");
CREATE INDEX "ListingOccupancy_listingId_dateFrom_dateTo_idx" ON "ListingOccupancy"("listingId", "dateFrom", "dateTo");
