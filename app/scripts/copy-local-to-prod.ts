// Copy every row from the local SQLite dev.db into the production Postgres
// (configured via DATABASE_URL_TARGET). Preserves IDs so relations match.
//
// Reads via Prisma (SQLite client), writes via raw `pg` so we don't need a
// second generated Prisma client locally.

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import pg from "pg";

const SOURCE_URL = process.env.DATABASE_URL_SOURCE ?? "file:./dev.db";
const TARGET_URL = process.env.DATABASE_URL_TARGET;
if (!TARGET_URL) {
  console.error("DATABASE_URL_TARGET must be set (Postgres connection string)");
  process.exit(1);
}

const source = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: SOURCE_URL }),
});
const pool = new pg.Pool({ connectionString: TARGET_URL });

// Quote a Postgres identifier (column or table name).
function q(name: string) {
  return `"${name}"`;
}

async function insertRow(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const values = cols.map((c) => row[c]);
  const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES (${placeholders.join(", ")})`;
  await pool.query(sql, values);
}

async function bulk(table: string, rows: Record<string, unknown>[]) {
  for (const r of rows) await insertRow(table, r);
  console.log(`  ✓ ${rows.length} ${table}`);
}

async function main() {
  console.log("Reading from local SQLite…");
  const [users, listings, proposals, agreements, policies, beta, messages, reports, cityArt] =
    await Promise.all([
      source.user.findMany(),
      source.listing.findMany(),
      source.swapProposal.findMany(),
      source.swapAgreement.findMany(),
      source.insurancePolicy.findMany(),
      source.betaSignup.findMany(),
      source.swapMessage.findMany(),
      source.report.findMany(),
      source.cityArt.findMany(),
    ]);
  console.log(
    `  users=${users.length} listings=${listings.length} proposals=${proposals.length} agreements=${agreements.length} policies=${policies.length} cityArt=${cityArt.length} beta=${beta.length} messages=${messages.length} reports=${reports.length}`
  );

  console.log("Wiping target tables (in FK order)…");
  await pool.query(
    `TRUNCATE "Report","SwapMessage","InsurancePolicy","SwapAgreement","SwapProposal","BetaSignup","Listing","User","CityArt" RESTART IDENTITY CASCADE`
  );

  console.log("Inserting into Postgres (FK order)…");
  await bulk("User", users);
  await bulk("Listing", listings);
  await bulk("CityArt", cityArt);
  await bulk("BetaSignup", beta);
  await bulk("SwapProposal", proposals);
  await bulk("SwapAgreement", agreements);
  await bulk("InsurancePolicy", policies);
  await bulk("SwapMessage", messages);
  await bulk("Report", reports);

  console.log("✅ Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await pool.end();
  });
