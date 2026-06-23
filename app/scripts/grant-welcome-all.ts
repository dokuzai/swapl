// One-off helper: grant a welcome_bonus of N Keys to EVERY user. Idempotent —
// uses lib/keys/ledger.grantWelcomeBonus, so any user who already has a
// welcome_bonus row is skipped (never double-granted), and each grant writes a
// proper ledger row + updates the cached balance atomically.
//
// Usage (against prod, like make-admin / verify-user):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED value>" npx tsx scripts/grant-welcome-all.ts 20
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client
//
// The amount defaults to 20. Pass --real-only to skip @demo.swapl seed accounts.

import { prisma } from "@/lib/db";
import { grantWelcomeBonus } from "@/lib/keys/ledger";

async function main() {
  const args = process.argv.slice(2);
  const amount = Number(args.find((a) => /^\d+$/.test(a)) ?? "20");
  const realOnly = args.includes("--real-only");
  if (!(amount > 0)) {
    console.error("Amount must be a positive integer.");
    process.exitCode = 1;
    return;
  }

  const users = await prisma.user.findMany({
    where: realOnly ? { NOT: { email: { endsWith: "@demo.swapl" } } } : {},
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    try {
      const row = await grantWelcomeBonus(u.id, amount);
      if (row) granted++;
      else skipped++;
    } catch (err) {
      console.error(`  ! ${u.email}:`, (err as Error).message);
    }
  }
  console.log(
    `✅ Welcome bonus of ${amount} Keys → granted to ${granted} user(s), skipped ${skipped} (already had one). Total considered: ${users.length}.`,
  );
}

main()
  .catch((err) => {
    console.error("[grant-welcome-all]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
