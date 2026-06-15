-- CreateTable
CREATE TABLE "PropertyVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "documents" TEXT NOT NULL DEFAULT '[]',
    "reviewedById" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropertyVerification_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PropertyVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListingPublishAck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ackText" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "mode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingPublishAck_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingPublishAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" DATETIME,
    "nightlyKeys" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("ac", "address", "availableFrom", "availableTo", "balcony", "bathrooms", "bedrooms", "bikeIncluded", "city", "country", "courtyard", "createdAt", "description", "dishwasher", "dryer", "featuredUntil", "floor", "garden", "gym", "hasElevator", "hasParking", "id", "isActive", "isFeatured", "isVerified", "lat", "lng", "maxStayDays", "minStayDays", "motifHint", "neighbourhood", "nightlyKeys", "paletteHint", "petTypes", "petsAllowed", "photos", "piano", "pool", "postcard", "propertyType", "rooftop", "sizeSqm", "sleeps", "stepFreeAccess", "tags", "title", "updatedAt", "userId", "verificationReviewedAt", "verificationReviewerId", "verificationStatus", "verificationSubmittedAt", "verificationVideoUrl", "washer", "wfhDesks", "wfhSetup") SELECT "ac", "address", "availableFrom", "availableTo", "balcony", "bathrooms", "bedrooms", "bikeIncluded", "city", "country", "courtyard", "createdAt", "description", "dishwasher", "dryer", "featuredUntil", "floor", "garden", "gym", "hasElevator", "hasParking", "id", "isActive", "isFeatured", "isVerified", "lat", "lng", "maxStayDays", "minStayDays", "motifHint", "neighbourhood", "nightlyKeys", "paletteHint", "petTypes", "petsAllowed", "photos", "piano", "pool", "postcard", "propertyType", "rooftop", "sizeSqm", "sleeps", "stepFreeAccess", "tags", "title", "updatedAt", "userId", "verificationReviewedAt", "verificationReviewerId", "verificationStatus", "verificationSubmittedAt", "verificationVideoUrl", "washer", "wfhDesks", "wfhSetup" FROM "Listing";
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
CREATE INDEX "PropertyVerification_status_idx" ON "PropertyVerification"("status");

-- CreateIndex
CREATE INDEX "PropertyVerification_listingId_idx" ON "PropertyVerification"("listingId");

-- CreateIndex
CREATE INDEX "ListingPublishAck_listingId_idx" ON "ListingPublishAck"("listingId");
