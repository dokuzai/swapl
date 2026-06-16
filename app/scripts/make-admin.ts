// One-off helper: grant (or check) the swapl_admin role for a user by email.
//
// Usage (against prod, like the AI-key backfill):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED value>" npx tsx scripts/make-admin.ts you@example.com
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client
//
// Pass --check to only print the current role without changing it.

import { prisma } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: tsx scripts/make-admin.ts <email> [--check]");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    console.error(`No user found with email ${email}. Check the address the account actually signed up with.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Found: ${user.email} (${user.name ?? "no name"}) — current role: ${user.role}`);
  if (checkOnly) return;
  if (user.role === "swapl_admin") {
    console.log("Already swapl_admin — nothing to do.");
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: "swapl_admin" } });
  console.log(`✅ Updated ${user.email} → role: swapl_admin`);
}

main()
  .catch((err) => {
    console.error("[make-admin]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
