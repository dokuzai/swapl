// Build-time guard: fail the deploy if the production Postgres DB is missing
// schema the deployed code expects (e.g. a new column added to
// schema.postgres.prisma but never applied to prod).
//
// Why this exists (incident 2026-06-19): merging to main auto-deploys, but
// `vercel-build` only runs `prisma generate` — it never applies migrations. A
// new `User.contactChannels` column shipped in the code while prod lacked it,
// so every authenticated User query (login, /api/me) 500'd. This check makes a
// deploy fail loudly instead, so the previous good deploy keeps serving.
//
// Behaviour:
//   • prod DB in sync with schema      → exit 0 (build proceeds)
//   • prod DB drifted (missing schema) → exit 1 (build FAILS, prints the SQL)
//   • no Postgres URL in env           → exit 0 (skip; local/preview build)
//   • checker error (can't connect…)   → exit 0 (fail-open, warn loudly — never
//                                          block deploys on a transient hiccup)
//
// Apply the printed SQL to prod (sw_DATABASE_URL_UNPOOLED) and redeploy. Note
// `prisma migrate deploy` can't be used here — the prisma/migrations/* files
// are SQLite-syntax; prod is synced via `prisma db push` or raw DDL.

import { spawnSync } from "node:child_process";

const url =
  process.env.sw_DATABASE_URL_UNPOOLED ||
  (/^postgres/i.test(process.env.DATABASE_URL || "") ? process.env.DATABASE_URL : "");

if (!url) {
  console.log("[schema-drift] no Postgres URL in env — skipping (local/preview build).");
  process.exit(0);
}

// Prisma 7 dropped --from-url; the live DB is read via --from-config-datasource
// using a Postgres-provider config (prisma.postgres.config.ts) whose datasource
// url we pass through DATABASE_URL. --to-schema is the desired schema.
const res = spawnSync(
  "prisma",
  [
    "migrate",
    "diff",
    "--config",
    "prisma.postgres.config.ts",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.postgres.prisma",
    "--script",
    "--exit-code",
  ],
  {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url },
    shell: process.platform === "win32",
  },
);

// prisma migrate diff --exit-code: 0 = no diff, 2 = diff present, 1 = error.
if (res.status === 0) {
  console.log("[schema-drift] production DB matches schema.postgres.prisma ✓");
  process.exit(0);
}

if (res.status === 2) {
  console.error("\n[schema-drift] ✖ Production DB is OUT OF SYNC with prisma/schema.postgres.prisma.");
  console.error("Deploy blocked so it can't serve code that queries columns the DB lacks.");
  console.error("Apply the following to prod (sw_DATABASE_URL_UNPOOLED), then redeploy:\n");
  console.error((res.stdout || res.stderr || "").trim() || "(prisma produced no diff script)");
  console.error("\nTip: `prisma db push --schema prisma/schema.postgres.prisma` with");
  console.error("DATABASE_URL=<sw_DATABASE_URL_UNPOOLED>, or apply the SQL above directly.");
  process.exit(1);
}

// status 1 / null: the check itself failed (network, auth, prisma error). Don't
// block the deploy on a checker hiccup — warn loudly and proceed.
console.warn("[schema-drift] ⚠ could not verify schema drift — proceeding without the guard.");
console.warn((res.stderr || res.stdout || res.error?.message || "unknown error").trim());
process.exit(0);
