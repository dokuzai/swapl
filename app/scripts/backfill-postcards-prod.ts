// Production-side postcard backfill. Uses raw `pg` so it doesn't need a
// Postgres-generated Prisma client to be built locally. For each listing
// whose city matches a preset, overwrite `postcard` with the latest preset
// composition. Cities without a preset are left as-is — the AI path will
// regenerate them on next view/create if cached.

import "dotenv/config";
import pg from "pg";
import { presetFor } from "../lib/ai/postcard-presets";

const TARGET = process.env.DATABASE_URL_TARGET ?? process.env.DATABASE_URL;
if (!TARGET || !TARGET.startsWith("postgres")) {
  console.error("Set DATABASE_URL_TARGET to your Postgres connection string.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: TARGET });

async function main() {
  const { rows } = await pool.query<{ id: string; city: string }>(
    `SELECT id, city FROM "Listing"`
  );
  console.log(`Found ${rows.length} listings`);
  let updated = 0;
  for (const row of rows) {
    const preset = presetFor(row.city);
    if (!preset) continue;
    await pool.query(`UPDATE "Listing" SET "postcard" = $1, "paletteHint" = $2 WHERE id = $3`, [
      JSON.stringify(preset),
      preset.palette,
      row.id,
    ]);
    updated++;
  }
  console.log(`✅ Refreshed ${updated} preset-backed postcards`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
