-- Optional before/after condition video (audio narration baked in) on a check
-- event. Nullable additive column — SQLite + Postgres compatible.

ALTER TABLE "SwapCheckEvent" ADD COLUMN "videoUrl" TEXT;
