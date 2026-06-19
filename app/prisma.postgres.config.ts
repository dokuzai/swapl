import "dotenv/config";
import { defineConfig } from "prisma/config";

// Used ONLY by the prod schema-drift guard (scripts/check-prod-schema-drift.mjs).
// The default prisma.config.ts points at the SQLite dev schema; this one points
// the Postgres datasource at whatever DATABASE_URL the guard passes (the live
// prod DB) so `prisma migrate diff` compares it against schema.postgres.prisma
// with matching providers. Not used by the app at runtime or by local dev.
export default defineConfig({
  schema: "prisma/schema.postgres.prisma",
  datasource: { url: process.env["DATABASE_URL"] },
});
