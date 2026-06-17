// Idempotently adds the new nullable columns from this release to Postgres.
//
// Usage:
//   DATABASE_URL_TARGET="postgres://..." tsx scripts/apply-postgres-video-archive-columns.ts
//
// Prisma's local migrations are SQLite-flavoured (they use DATETIME, which is NOT
// a Postgres type). This script applies the same columns with correct Postgres
// types so the check-in/out video and per-party proposal archive work in prod.
//   - SwapCheckEvent.videoUrl            (String?)  -> TEXT
//   - SwapProposal.proposerArchivedAt    (DateTime?) -> TIMESTAMP(3)
//   - SwapProposal.targetArchivedAt      (DateTime?) -> TIMESTAMP(3)

import { config } from "dotenv";
import pg from "pg";

// Neon prod creds live in .env.production.local (sw_ prefix), which plain dotenv
// doesn't auto-load. Load it explicitly, then accept the usual var names.
config({ path: ".env.production.local" });
config(); // also pick up a plain .env if present (won't override existing vars)

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
  await pool.query(`ALTER TABLE "SwapCheckEvent" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT`);
  await pool.query(`ALTER TABLE "SwapProposal" ADD COLUMN IF NOT EXISTS "proposerArchivedAt" TIMESTAMP(3)`);
  await pool.query(`ALTER TABLE "SwapProposal" ADD COLUMN IF NOT EXISTS "targetArchivedAt" TIMESTAMP(3)`);
  await pool.query(`ALTER TABLE "SwapReview" ADD COLUMN IF NOT EXISTS "listingId" TEXT`);
  console.log("Applied: SwapCheckEvent.videoUrl, SwapProposal.proposer/targetArchivedAt, SwapReview.listingId");
}

main()
  .catch((err) => {
    console.error("[apply-postgres-video-archive-columns]", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
