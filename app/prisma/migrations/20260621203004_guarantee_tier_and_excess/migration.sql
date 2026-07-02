-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InsurancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'swapl-cover',
    "policyNumber" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'goodwill',
    "coverageAmount" INTEGER NOT NULL DEFAULT 5000,
    "deductibleAmount" INTEGER NOT NULL DEFAULT 750,
    "status" TEXT NOT NULL DEFAULT 'active',
    "premiumCents" INTEGER NOT NULL DEFAULT 0,
    "platformShareCents" INTEGER NOT NULL DEFAULT 0,
    "documentsUrl" TEXT,
    "externalId" TEXT,
    "onChainRef" TEXT,
    "onChainNetwork" TEXT,
    "onChainStatus" TEXT,
    "anchoredAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsurancePolicy_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InsurancePolicy" ("agreementId", "anchoredAt", "coverageAmount", "createdAt", "documentsUrl", "expiresAt", "externalId", "id", "onChainNetwork", "onChainRef", "onChainStatus", "platformShareCents", "policyNumber", "premiumCents", "provider", "status") SELECT "agreementId", "anchoredAt", "coverageAmount", "createdAt", "documentsUrl", "expiresAt", "externalId", "id", "onChainNetwork", "onChainRef", "onChainStatus", "platformShareCents", "policyNumber", "premiumCents", "provider", "status" FROM "InsurancePolicy";
DROP TABLE "InsurancePolicy";
ALTER TABLE "new_InsurancePolicy" RENAME TO "InsurancePolicy";
CREATE UNIQUE INDEX "InsurancePolicy_agreementId_key" ON "InsurancePolicy"("agreementId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
