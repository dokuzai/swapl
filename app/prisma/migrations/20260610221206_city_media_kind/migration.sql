-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CityMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CityMedia" ("city", "country", "fetchedAt", "id", "photos", "provider") SELECT "city", "country", "fetchedAt", "id", "photos", "provider" FROM "CityMedia";
DROP TABLE "CityMedia";
ALTER TABLE "new_CityMedia" RENAME TO "CityMedia";
CREATE UNIQUE INDEX "CityMedia_city_country_kind_key" ON "CityMedia"("city", "country", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
