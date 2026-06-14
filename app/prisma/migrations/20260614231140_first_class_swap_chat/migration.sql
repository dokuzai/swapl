-- CreateTable
CREATE TABLE "SwapMessageEmailThrottle" (
    "proposalId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "lastEmailedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("proposalId", "recipientId")
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SwapMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SwapMessage_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SwapProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SwapMessage" ("authorId", "body", "createdAt", "id", "proposalId") SELECT "authorId", "body", "createdAt", "id", "proposalId" FROM "SwapMessage";
DROP TABLE "SwapMessage";
ALTER TABLE "new_SwapMessage" RENAME TO "SwapMessage";
CREATE INDEX "SwapMessage_proposalId_createdAt_idx" ON "SwapMessage"("proposalId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
