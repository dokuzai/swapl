-- JRN-GP-03: a SwapDispute can attach to a KeysStay as well as a SwapAgreement.
-- agreementId becomes nullable (additive/safe — every existing row already has
-- one), keysStayId + its FK are added. SQLite requires a table rebuild to drop
-- the NOT NULL.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SwapDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT,
    "keysStayId" TEXT,
    "openedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SwapDispute_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapDispute_keysStayId_fkey" FOREIGN KEY ("keysStayId") REFERENCES "KeysStay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapDispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SwapDispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SwapDispute" ("agreementId", "category", "createdAt", "description", "id", "openedById", "photos", "resolution", "resolvedById", "status", "updatedAt") SELECT "agreementId", "category", "createdAt", "description", "id", "openedById", "photos", "resolution", "resolvedById", "status", "updatedAt" FROM "SwapDispute";
DROP TABLE "SwapDispute";
ALTER TABLE "new_SwapDispute" RENAME TO "SwapDispute";
CREATE INDEX "SwapDispute_agreementId_idx" ON "SwapDispute"("agreementId");
CREATE INDEX "SwapDispute_keysStayId_idx" ON "SwapDispute"("keysStayId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
