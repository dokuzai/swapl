-- AlterTable
ALTER TABLE "User" ADD COLUMN "homeCity" TEXT;
ALTER TABLE "User" ADD COLUMN "homeCountry" TEXT;
ALTER TABLE "User" ADD COLUMN "languages" TEXT;
ALTER TABLE "User" ADD COLUMN "settings" TEXT;
ALTER TABLE "User" ADD COLUMN "work" TEXT;

-- CreateTable
CREATE TABLE "SwapReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SwapReview_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapReview_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SwapReview_subjectId_idx" ON "SwapReview"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SwapReview_agreementId_authorId_key" ON "SwapReview"("agreementId", "authorId");
