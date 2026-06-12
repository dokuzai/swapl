-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SwapReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'published',
    "moderatedAt" DATETIME,
    "moderatedById" TEXT,
    CONSTRAINT "SwapReview_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SwapReview" ("agreementId", "authorId", "createdAt", "id", "rating", "subjectId", "text") SELECT "agreementId", "authorId", "createdAt", "id", "rating", "subjectId", "text" FROM "SwapReview";
DROP TABLE "SwapReview";
ALTER TABLE "new_SwapReview" RENAME TO "SwapReview";
CREATE INDEX "SwapReview_subjectId_idx" ON "SwapReview"("subjectId");
CREATE UNIQUE INDEX "SwapReview_agreementId_authorId_key" ON "SwapReview"("agreementId", "authorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
