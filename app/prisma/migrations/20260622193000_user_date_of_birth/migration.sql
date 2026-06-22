-- Date of birth on a member's profile (DOK-219). Stored at UTC midnight; only
-- the calendar date is meaningful. Private — used to confirm age, never exposed
-- on the public profile. Nullable additive column — SQLite + Postgres compatible.

ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATETIME;
