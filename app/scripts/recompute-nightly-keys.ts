// One-off: recompute every listing's nightly Keys to the capacity model (DOK-219).
//
// Value = the home's guest capacity (sleeps): nightlyKeys = nightlyKeysBase =
// capacity, with the review-feedback adjustment frozen at 0. Run once after
// shipping the capacity valuation so existing listings' cached/display values
// match what nightlyKeysFor now returns. Idempotent — safe to re-run.
//
// Local:
//   npx tsx scripts/recompute-nightly-keys.ts            # apply
//   npx tsx scripts/recompute-nightly-keys.ts --check    # dry run, print counts
// Prod (Neon, like make-admin / confirm-user):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED value>" npx tsx scripts/recompute-nightly-keys.ts
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client

import { prisma } from "@/lib/db";
import { capacityNightlyKeys } from "@/lib/keys/value";

async function main() {
  const dryRun = process.argv.includes("--check");
  const listings = await prisma.listing.findMany({
    select: { id: true, sleeps: true, nightlyKeys: true },
  });

  let changed = 0;
  for (const l of listings) {
    const next = capacityNightlyKeys(l.sleeps);
    if (l.nightlyKeys === next) continue;
    changed++;
    if (!dryRun) {
      await prisma.listing.update({
        where: { id: l.id },
        data: {
          nightlyKeys: next,
          nightlyKeysBase: next,
          nightlyKeysAdjustment: 0,
          valuationUpdatedAt: new Date(),
        },
      });
    }
  }

  console.log(
    `${dryRun ? "[check] " : ""}${listings.length} listings scanned; ` +
      `${changed} ${dryRun ? "would be updated" : "updated"} to the capacity value.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
