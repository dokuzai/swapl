// Idempotently adds the daily location-tracking schema to Postgres.
//
// Usage:
//   tsx scripts/apply-postgres-location-tracking.ts
//   (reads sw_DATABASE_URL_UNPOOLED from app/.env.production.local)
//
// Prisma's local migrations are SQLite-flavoured (DATETIME). This applies the
// same shape with Postgres types so Swapalitics "days abroad" works in prod:
//   - User.lastSeenCountry/Region/City  (String?)   -> TEXT
//   - User.lastSeenAt                    (DateTime?) -> TIMESTAMP(3)
//   - UserLocationDay table              (one coarse fix per user per day)

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.production.local" });
config();

const TARGET_URL =
  process.env.DATABASE_URL_TARGET ??
  process.env.sw_DATABASE_URL_UNPOOLED ??
  process.env.sw_POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;
if (!TARGET_URL || !TARGET_URL.startsWith("postgres")) {
  console.error(
    "No Postgres connection string found. Set DATABASE_URL_TARGET, or ensure sw_DATABASE_URL_UNPOOLED is in app/.env.production.local.",
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: TARGET_URL });

async function main() {
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenCountry" TEXT`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenRegion" TEXT`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenCity" TEXT`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "UserLocationDay" (
      "id"          TEXT NOT NULL,
      "userId"      TEXT NOT NULL,
      "day"         TIMESTAMP(3) NOT NULL,
      "countryCode" TEXT,
      "region"      TEXT,
      "city"        TEXT,
      "source"      TEXT NOT NULL DEFAULT 'ip',
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserLocationDay_pkey" PRIMARY KEY ("id")
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserLocationDay_userId_day_key" ON "UserLocationDay"("userId", "day")`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "UserLocationDay_userId_idx" ON "UserLocationDay"("userId")`,
  );
  // FK (added separately so re-runs don't fail if it already exists).
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "UserLocationDay"
        ADD CONSTRAINT "UserLocationDay_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  console.log("Applied: User.lastSeen* columns + UserLocationDay table.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
