-- DOK-164: Keys earning hooks — modest, identity-gated, idempotent, capped
-- bonuses that mint Keys for actions adding supply/trust to the marketplace.
--
-- 1) KeysTransaction.eventKey: deterministic per-event idempotency key. A
--    UNIQUE index makes a replayed/concurrent event write at most one ledger
--    row (see lib/keys/earn.ts grantEarnOnce).
-- 2) ListingShareAttribution: minimal share->conversion attribution so a user
--    who shared a listing is credited once when an invited guest books/swaps it.
--    (No JSON columns here, so nothing to keep as TEXT for the dual-schema rule.)

-- AlterTable
ALTER TABLE "KeysTransaction" ADD COLUMN "eventKey" TEXT;

-- CreateTable
CREATE TABLE "ListingShareAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "sharerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "convertedById" TEXT,
    "conversionRef" TEXT,
    "convertedAt" DATETIME,
    "keysAwardedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingShareAttribution_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingShareAttribution_sharerId_fkey" FOREIGN KEY ("sharerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingShareAttribution_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingShareAttribution_token_key" ON "ListingShareAttribution"("token");

-- CreateIndex
CREATE INDEX "ListingShareAttribution_sharerId_idx" ON "ListingShareAttribution"("sharerId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingShareAttribution_listingId_sharerId_key" ON "ListingShareAttribution"("listingId", "sharerId");

-- CreateIndex
CREATE UNIQUE INDEX "KeysTransaction_eventKey_key" ON "KeysTransaction"("eventKey");
