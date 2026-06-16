// Idempotently installs the production-grade availability overlap guard.
//
// Usage:
//   DATABASE_URL_TARGET="postgres://..." tsx scripts/apply-postgres-availability-constraints.ts
//
// Prisma's local migrations are SQLite-compatible. This script provisions the
// Postgres-only GiST exclusion constraint that makes overlapping occupancy rows
// impossible even under concurrent requests.

import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

const TARGET_URL = process.env.DATABASE_URL_TARGET ?? process.env.DATABASE_URL;
if (!TARGET_URL || !TARGET_URL.startsWith("postgres")) {
  console.error("Set DATABASE_URL_TARGET or DATABASE_URL to your Postgres connection string.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: TARGET_URL });

async function main() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ListingOccupancy" (
      "id" TEXT PRIMARY KEY,
      "listingId" TEXT NOT NULL REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "source" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "dateFrom" TIMESTAMP(3) NOT NULL,
      "dateTo" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ListingOccupancy_source_sourceId_listingId_key"
    ON "ListingOccupancy"("source", "sourceId", "listingId")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "ListingOccupancy_listingId_dateFrom_dateTo_idx"
    ON "ListingOccupancy"("listingId", "dateFrom", "dateTo")
  `);

  await backfillOccupancy();

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ListingOccupancy_no_overlap'
      ) THEN
        ALTER TABLE "ListingOccupancy"
          ADD CONSTRAINT "ListingOccupancy_no_overlap"
          EXCLUDE USING gist (
            "listingId" WITH =,
            tsrange("dateFrom", "dateTo", '[)') WITH &&
          );
      END IF;
    END $$;
  `);

  console.log("ListingOccupancy Postgres exclusion constraint installed.");
}

async function backfillOccupancy() {
  await pool.query(`
    INSERT INTO "ListingOccupancy" ("id", "listingId", "source", "sourceId", "dateFrom", "dateTo", "createdAt")
    SELECT $1 || a.id || '_' || a."listing1Id", a."listing1Id", 'swap_agreement', a.id, a."dateFrom", a."dateTo", CURRENT_TIMESTAMP
    FROM "SwapAgreement" a
    WHERE a.status = 'ACTIVE'
    ON CONFLICT ("source", "sourceId", "listingId") DO NOTHING
  `, [`occ_${randomUUID()}_`]);
  await pool.query(`
    INSERT INTO "ListingOccupancy" ("id", "listingId", "source", "sourceId", "dateFrom", "dateTo", "createdAt")
    SELECT $1 || a.id || '_' || a."listing2Id", a."listing2Id", 'swap_agreement', a.id, a."dateFrom", a."dateTo", CURRENT_TIMESTAMP
    FROM "SwapAgreement" a
    WHERE a.status = 'ACTIVE'
    ON CONFLICT ("source", "sourceId", "listingId") DO NOTHING
  `, [`occ_${randomUUID()}_`]);
  await pool.query(`
    INSERT INTO "ListingOccupancy" ("id", "listingId", "source", "sourceId", "dateFrom", "dateTo", "createdAt")
    SELECT $1 || s.id, s."listingId", 'keys_stay', s.id, s."dateFrom", s."dateTo", CURRENT_TIMESTAMP
    FROM "KeysStay" s
    WHERE s.status IN ('pending', 'confirmed')
    ON CONFLICT ("source", "sourceId", "listingId") DO NOTHING
  `, [`occ_${randomUUID()}_`]);
  await pool.query(`
    INSERT INTO "ListingOccupancy" ("id", "listingId", "source", "sourceId", "dateFrom", "dateTo", "createdAt")
    SELECT $1 || b.id, b."listingId", 'blocked_range', b.id, b."dateFrom", b."dateTo", CURRENT_TIMESTAMP
    FROM "ListingBlockedRange" b
    ON CONFLICT ("source", "sourceId", "listingId") DO NOTHING
  `, [`occ_${randomUUID()}_`]);
}

main()
  .catch((err) => {
    console.error("[apply-postgres-availability-constraints]", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
