-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "passwordHash" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiApiKey" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "proposalsThisMonthCount" INTEGER NOT NULL DEFAULT 0,
    "proposalsCounterResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hideSponsoredContent" BOOLEAN NOT NULL DEFAULT false,
    "interests" TEXT NOT NULL DEFAULT '[]',
    "bioVibe" TEXT
);
INSERT INTO "new_User" ("aiApiKey", "aiModel", "aiProvider", "avatar", "bio", "createdAt", "email", "hideSponsoredContent", "id", "name", "passwordHash", "proposalsCounterResetAt", "proposalsThisMonthCount", "role", "verified") SELECT "aiApiKey", "aiModel", "aiProvider", "avatar", "bio", "createdAt", "email", "hideSponsoredContent", "id", "name", "passwordHash", "proposalsCounterResetAt", "proposalsThisMonthCount", "role", "verified" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
