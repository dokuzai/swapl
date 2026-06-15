-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "nightlyKeys" INTEGER;

-- CreateTable
CREATE TABLE "KeysTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "stayId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeysTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeysStay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "dateFrom" DATETIME NOT NULL,
    "dateTo" DATETIME NOT NULL,
    "nights" INTEGER NOT NULL,
    "keysCost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "insurancePolicyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeysStay_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeysStay_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeysStay_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "passwordHash" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "emailVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" DATETIME,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiApiKey" TEXT,
    "suspendedAt" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'member',
    "proposalsThisMonthCount" INTEGER NOT NULL DEFAULT 0,
    "proposalsCounterResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hideSponsoredContent" BOOLEAN NOT NULL DEFAULT false,
    "keysBalance" INTEGER NOT NULL DEFAULT 0,
    "interests" TEXT NOT NULL DEFAULT '[]',
    "bioVibe" TEXT,
    "work" TEXT,
    "languages" TEXT,
    "homeCity" TEXT,
    "homeCountry" TEXT,
    "settings" TEXT
);
INSERT INTO "new_User" ("aiApiKey", "aiModel", "aiProvider", "avatar", "bio", "bioVibe", "createdAt", "email", "emailVerifiedAt", "hideSponsoredContent", "homeCity", "homeCountry", "id", "interests", "languages", "lastActiveAt", "name", "passwordHash", "phone", "proposalsCounterResetAt", "proposalsThisMonthCount", "role", "settings", "suspendedAt", "verified", "verifiedAt", "work") SELECT "aiApiKey", "aiModel", "aiProvider", "avatar", "bio", "bioVibe", "createdAt", "email", "emailVerifiedAt", "hideSponsoredContent", "homeCity", "homeCountry", "id", "interests", "languages", "lastActiveAt", "name", "passwordHash", "phone", "proposalsCounterResetAt", "proposalsThisMonthCount", "role", "settings", "suspendedAt", "verified", "verifiedAt", "work" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KeysTransaction_userId_idx" ON "KeysTransaction"("userId");

-- CreateIndex
CREATE INDEX "KeysStay_listingId_idx" ON "KeysStay"("listingId");

-- CreateIndex
CREATE INDEX "KeysStay_guestId_idx" ON "KeysStay"("guestId");

-- CreateIndex
CREATE INDEX "KeysStay_hostId_idx" ON "KeysStay"("hostId");

-- CreateIndex
CREATE INDEX "KeysStay_status_idx" ON "KeysStay"("status");
