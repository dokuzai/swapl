-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InspirationPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" TEXT NOT NULL,
    "proposalId" TEXT,
    "setupIntentId" TEXT,
    "paymentMethodId" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InspirationPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InspirationPackage" ("createdAt", "id", "payload", "proposalId", "status", "updatedAt", "userId") SELECT "createdAt", "id", "payload", "proposalId", "status", "updatedAt", "userId" FROM "InspirationPackage";
DROP TABLE "InspirationPackage";
ALTER TABLE "new_InspirationPackage" RENAME TO "InspirationPackage";
CREATE INDEX "InspirationPackage_userId_idx" ON "InspirationPackage"("userId");
CREATE INDEX "InspirationPackage_proposalId_idx" ON "InspirationPackage"("proposalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
