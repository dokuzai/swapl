-- CreateTable
CREATE TABLE "CityMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CityMedia_city_country_key" ON "CityMedia"("city", "country");
