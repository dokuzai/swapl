// Deploy-time prod schema sync: apply additive schema changes to the prod
// Postgres DB automatically, so a schema change can't ship without the column
// it needs (the 2026-06-19 login outage). Replaces the manual ALTER step.
//
// Uses `prisma db push` WITHOUT --accept-data-loss / --force-reset:
//   • purely additive change (new column/table/index) → applied, build proceeds
//   • destructive / data-loss change (drop, lossy type change, NOT NULL on a
//     populated table…)                               → push fails → BUILD FAILS
//     so a human reviews it instead of prod silently losing data.
//
// Safety rails:
//   • Runs ONLY on production deploys (VERCEL_ENV=production). Preview/local
//     builds NEVER touch prod — a preview branch could carry an unmerged column.
//   • Skips when no Postgres URL is present.
//   • The prod URL is passed via env (DATABASE_URL) + prisma.postgres.config.ts,
//     never on the command line, so it can't leak into process args.
//
// Dry-run / pre-merge check is the read-only `npm run check:prod-schema`.

import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
if (vercelEnv && vercelEnv !== "production") {
  console.log(`[sync-prod-schema] VERCEL_ENV=${vercelEnv} — not production, skipping (no prod DB writes on preview).`);
  process.exit(0);
}

const url =
  process.env.sw_DATABASE_URL_UNPOOLED ||
  (/^postgres/i.test(process.env.DATABASE_URL || "") ? process.env.DATABASE_URL : "");

if (!url) {
  console.log("[sync-prod-schema] no Postgres URL in env — skipping (local build).");
  process.exit(0);
}

console.log("[sync-prod-schema] syncing prod DB to schema.postgres.prisma");
console.log("[sync-prod-schema] (additive changes apply; destructive changes fail the build for manual review)");

const res = spawnSync(
  "prisma",
  ["db", "push", "--config", "prisma.postgres.config.ts"],
  {
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
    shell: process.platform === "win32",
  },
);

if (res.status !== 0) {
  console.error("\n[sync-prod-schema] ✖ `prisma db push` failed.");
  console.error("Most likely a destructive / data-loss change that needs manual review,");
  console.error("or a transient connection error. Review the output above. If the data loss");
  console.error("is intended, apply it deliberately (e.g. with --accept-data-loss) and redeploy.");
  process.exit(res.status || 1);
}

console.log("[sync-prod-schema] prod schema in sync ✓");
