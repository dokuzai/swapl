-- CreateTable
CREATE TABLE "TravelWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateFrom" DATETIME NOT NULL,
    "dateTo" DATETIME NOT NULL,
    "flexible" BOOLEAN NOT NULL DEFAULT false,
    "destinations" TEXT,
    "notes" TEXT,
    "lastNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TravelWindow_userId_idx" ON "TravelWindow"("userId");
