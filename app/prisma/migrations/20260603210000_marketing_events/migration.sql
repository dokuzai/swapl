CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "path" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "content" TEXT,
    "referrer" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MarketingEvent_eventName_createdAt_idx" ON "MarketingEvent"("eventName", "createdAt");
CREATE INDEX "MarketingEvent_campaign_idx" ON "MarketingEvent"("campaign");
CREATE INDEX "MarketingEvent_source_idx" ON "MarketingEvent"("source");
