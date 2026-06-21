-- CreateTable
CREATE TABLE "CouchsurferMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'stripe',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CouchsurferMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KeysStay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "dateFrom" DATETIME NOT NULL,
    "dateTo" DATETIME NOT NULL,
    "nights" INTEGER NOT NULL,
    "keysCost" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'keys',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "insurancePolicyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeysStay_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeysStay_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeysStay_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KeysStay" ("createdAt", "dateFrom", "dateTo", "guestId", "hostId", "id", "insurancePolicyId", "keysCost", "listingId", "nights", "status") SELECT "createdAt", "dateFrom", "dateTo", "guestId", "hostId", "id", "insurancePolicyId", "keysCost", "listingId", "nights", "status" FROM "KeysStay";
DROP TABLE "KeysStay";
ALTER TABLE "new_KeysStay" RENAME TO "KeysStay";
CREATE INDEX "KeysStay_listingId_idx" ON "KeysStay"("listingId");
CREATE INDEX "KeysStay_guestId_idx" ON "KeysStay"("guestId");
CREATE INDEX "KeysStay_hostId_idx" ON "KeysStay"("hostId");
CREATE INDEX "KeysStay_status_idx" ON "KeysStay"("status");
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighbourhood" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "sizeSqm" INTEGER NOT NULL,
    "sleeps" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "floor" INTEGER,
    "hasElevator" BOOLEAN NOT NULL DEFAULT false,
    "stepFreeAccess" BOOLEAN NOT NULL DEFAULT false,
    "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "petTypes" TEXT NOT NULL DEFAULT '[]',
    "wfhSetup" BOOLEAN NOT NULL DEFAULT false,
    "wfhDesks" INTEGER NOT NULL DEFAULT 0,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "bikeIncluded" BOOLEAN NOT NULL DEFAULT false,
    "rooftop" BOOLEAN NOT NULL DEFAULT false,
    "balcony" BOOLEAN NOT NULL DEFAULT false,
    "garden" BOOLEAN NOT NULL DEFAULT false,
    "courtyard" BOOLEAN NOT NULL DEFAULT false,
    "piano" BOOLEAN NOT NULL DEFAULT false,
    "pool" BOOLEAN NOT NULL DEFAULT false,
    "gym" BOOLEAN NOT NULL DEFAULT false,
    "ac" BOOLEAN NOT NULL DEFAULT false,
    "dishwasher" BOOLEAN NOT NULL DEFAULT false,
    "washer" BOOLEAN NOT NULL DEFAULT false,
    "dryer" BOOLEAN NOT NULL DEFAULT false,
    "availableFrom" DATETIME NOT NULL,
    "availableTo" DATETIME NOT NULL,
    "minStayDays" INTEGER NOT NULL DEFAULT 3,
    "maxStayDays" INTEGER NOT NULL DEFAULT 30,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "paletteHint" TEXT,
    "motifHint" TEXT,
    "postcard" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'none',
    "verificationVideoUrl" TEXT,
    "verificationSubmittedAt" DATETIME,
    "verificationReviewedAt" DATETIME,
    "verificationReviewerId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "ownerVerified" BOOLEAN NOT NULL DEFAULT false,
    "ineligibleReason" TEXT,
    "ineligibleAt" DATETIME,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" DATETIME,
    "nightlyKeys" INTEGER,
    "spaceType" TEXT NOT NULL DEFAULT 'entire_place',
    "roomsOffered" INTEGER,
    "couchsurfingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "nightlyKeysBase" INTEGER,
    "nightlyKeysAdjustment" REAL,
    "locationTier" INTEGER,
    "valuationExplanation" TEXT,
    "valuationUpdatedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("ac", "address", "availableFrom", "availableTo", "balcony", "bathrooms", "bedrooms", "bikeIncluded", "city", "country", "courtyard", "createdAt", "description", "dishwasher", "dryer", "featuredUntil", "floor", "garden", "gym", "hasElevator", "hasParking", "id", "ineligibleAt", "ineligibleReason", "isActive", "isFeatured", "isVerified", "lat", "lng", "locationTier", "maxStayDays", "minStayDays", "motifHint", "neighbourhood", "nightlyKeys", "nightlyKeysAdjustment", "nightlyKeysBase", "ownerVerified", "paletteHint", "petTypes", "petsAllowed", "photos", "piano", "pool", "postcard", "propertyType", "rooftop", "roomsOffered", "sizeSqm", "sleeps", "spaceType", "stepFreeAccess", "tags", "title", "updatedAt", "userId", "valuationExplanation", "valuationUpdatedAt", "verificationReviewedAt", "verificationReviewerId", "verificationStatus", "verificationSubmittedAt", "verificationVideoUrl", "washer", "wfhDesks", "wfhSetup") SELECT "ac", "address", "availableFrom", "availableTo", "balcony", "bathrooms", "bedrooms", "bikeIncluded", "city", "country", "courtyard", "createdAt", "description", "dishwasher", "dryer", "featuredUntil", "floor", "garden", "gym", "hasElevator", "hasParking", "id", "ineligibleAt", "ineligibleReason", "isActive", "isFeatured", "isVerified", "lat", "lng", "locationTier", "maxStayDays", "minStayDays", "motifHint", "neighbourhood", "nightlyKeys", "nightlyKeysAdjustment", "nightlyKeysBase", "ownerVerified", "paletteHint", "petTypes", "petsAllowed", "photos", "piano", "pool", "postcard", "propertyType", "rooftop", "roomsOffered", "sizeSqm", "sleeps", "spaceType", "stepFreeAccess", "tags", "title", "updatedAt", "userId", "valuationExplanation", "valuationUpdatedAt", "verificationReviewedAt", "verificationReviewerId", "verificationStatus", "verificationSubmittedAt", "verificationVideoUrl", "washer", "wfhDesks", "wfhSetup" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE INDEX "Listing_city_idx" ON "Listing"("city");
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");
CREATE INDEX "Listing_isActive_idx" ON "Listing"("isActive");
CREATE INDEX "Listing_isFeatured_featuredUntil_idx" ON "Listing"("isFeatured", "featuredUntil");
CREATE INDEX "Listing_isVerified_idx" ON "Listing"("isVerified");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CouchsurferMembership_userId_key" ON "CouchsurferMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouchsurferMembership_stripeSubscriptionId_key" ON "CouchsurferMembership"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CouchsurferMembership_status_idx" ON "CouchsurferMembership"("status");
