-- AlterTable
ALTER TABLE "SwapAgreement" ADD COLUMN "checkInNudgeSentAt" DATETIME;
ALTER TABLE "SwapAgreement" ADD COLUMN "guideReminderSentAt" DATETIME;

-- CreateTable
CREATE TABLE "ListingHomeGuide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "accessInstructions" TEXT,
    "keyPickup" TEXT,
    "wifiName" TEXT,
    "wifiPassword" TEXT,
    "heatingCooling" TEXT,
    "kitchen" TEXT,
    "bins" TEXT,
    "petsPlants" TEXT,
    "houseRules" TEXT,
    "neighbourhood" TEXT,
    "emergencyContact" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingHomeGuide_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SwapCheckEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SwapCheckEvent_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapCheckEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingHomeGuide_listingId_key" ON "ListingHomeGuide"("listingId");

-- CreateIndex
CREATE INDEX "SwapCheckEvent_agreementId_idx" ON "SwapCheckEvent"("agreementId");
