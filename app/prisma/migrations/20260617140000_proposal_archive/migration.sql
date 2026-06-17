-- Per-party inbox archive for swap proposals: each side can hide a thread from
-- their own inbox without affecting the other party. Nullable additive columns —
-- SQLite + Postgres compatible.

ALTER TABLE "SwapProposal" ADD COLUMN "proposerArchivedAt" DATETIME;
ALTER TABLE "SwapProposal" ADD COLUMN "targetArchivedAt" DATETIME;
