-- JRN-GP-01: a SwapReview can attach to a KeysStay as well as a SwapAgreement.
-- agreementId becomes nullable (additive/safe — every existing row already has
-- one), keysStayId + its FK are added, and a second unique rule keeps each side
-- one-review-per-author. SQLite requires a table rebuild to drop the NOT NULL.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SwapReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT,
    "keysStayId" TEXT,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "listingId" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'published',
    "moderatedAt" DATETIME,
    "moderatedById" TEXT,
    CONSTRAINT "SwapReview_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_keysStayId_fkey" FOREIGN KEY ("keysStayId") REFERENCES "KeysStay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SwapReview" ("agreementId", "authorId", "createdAt", "id", "listingId", "moderatedAt", "moderatedById", "rating", "status", "subjectId", "text") SELECT "agreementId", "authorId", "createdAt", "id", "listingId", "moderatedAt", "moderatedById", "rating", "status", "subjectId", "text" FROM "SwapReview";
DROP TABLE "SwapReview";
ALTER TABLE "new_SwapReview" RENAME TO "SwapReview";
CREATE INDEX "SwapReview_subjectId_idx" ON "SwapReview"("subjectId");
CREATE UNIQUE INDEX "SwapReview_agreementId_authorId_key" ON "SwapReview"("agreementId", "authorId");
CREATE UNIQUE INDEX "SwapReview_keysStayId_authorId_key" ON "SwapReview"("keysStayId", "authorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
