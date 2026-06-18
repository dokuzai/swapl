-- Off-platform contact channels for a member's profile (DOK-204/205).
-- JSON-encoded TEXT, member-entered, revealed to a counterparty only once a
-- swap is ACCEPTED. Nullable additive column — SQLite + Postgres compatible.

ALTER TABLE "User" ADD COLUMN "contactChannels" TEXT;
