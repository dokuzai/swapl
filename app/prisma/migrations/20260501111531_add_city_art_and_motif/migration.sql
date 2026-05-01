-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "motifHint" TEXT;

-- CreateTable
CREATE TABLE "CityArt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "country" TEXT,
    "palette" TEXT NOT NULL,
    "motif" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CityArt_city_key" ON "CityArt"("city");
