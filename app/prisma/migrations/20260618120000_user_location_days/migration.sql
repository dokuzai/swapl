-- Daily coarse location tracking for Swapalitics "days abroad".
-- Additive: nullable User columns + a new table. SQLite + Postgres compatible.

ALTER TABLE "User" ADD COLUMN "lastSeenCountry" TEXT;
ALTER TABLE "User" ADD COLUMN "lastSeenRegion" TEXT;
ALTER TABLE "User" ADD COLUMN "lastSeenCity" TEXT;
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;

CREATE TABLE "UserLocationDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ip',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLocationDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserLocationDay_userId_day_key" ON "UserLocationDay"("userId", "day");
CREATE INDEX "UserLocationDay_userId_idx" ON "UserLocationDay"("userId");
