-- CreateTable
CREATE TABLE "AppFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "source" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'account',
    "contextKey" TEXT NOT NULL DEFAULT '',
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AppFeedback_userId_idx" ON "AppFeedback"("userId");

-- CreateIndex
CREATE INDEX "AppFeedback_source_idx" ON "AppFeedback"("source");

-- CreateIndex
CREATE INDEX "AppFeedback_createdAt_idx" ON "AppFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppFeedback_userId_surface_contextKey_key" ON "AppFeedback"("userId", "surface", "contextKey");
