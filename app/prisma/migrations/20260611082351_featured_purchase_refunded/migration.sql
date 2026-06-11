-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ListingFeaturedPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingFeaturedPurchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ListingFeaturedPurchase" ("amountCents", "createdAt", "durationDays", "endsAt", "id", "listingId", "startsAt", "stripePaymentIntentId") SELECT "amountCents", "createdAt", "durationDays", "endsAt", "id", "listingId", "startsAt", "stripePaymentIntentId" FROM "ListingFeaturedPurchase";
DROP TABLE "ListingFeaturedPurchase";
ALTER TABLE "new_ListingFeaturedPurchase" RENAME TO "ListingFeaturedPurchase";
CREATE UNIQUE INDEX "ListingFeaturedPurchase_stripePaymentIntentId_key" ON "ListingFeaturedPurchase"("stripePaymentIntentId");
CREATE INDEX "ListingFeaturedPurchase_listingId_endsAt_idx" ON "ListingFeaturedPurchase"("listingId", "endsAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
