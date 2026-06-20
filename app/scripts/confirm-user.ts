// One-off helper: manually confirm (verify) a user's email by email address.
//
// Use this when a user registered but never received the verification email,
// so they're stuck with emailVerifiedAt = null. This does exactly what the
// real verify-email link does (app/api/auth/verify-email/[token]/route.ts):
// it sets User.emailVerifiedAt to the current time.
//
// Usage (against prod, like make-admin / the AI-key backfill):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED value>" npx tsx scripts/confirm-user.ts user@example.com
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client
//
// Pass --check to only print the current verification status without changing it.

import { prisma } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: tsx scripts/confirm-user.ts <email> [--check]");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });
  if (!user) {
    console.error(`No user found with email ${email}. Check the address the account actually signed up with.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Found: ${user.email} (${user.name ?? "no name"}) — emailVerifiedAt: ${
      user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : "null (not verified)"
    }`,
  );
  if (checkOnly) return;
  if (user.emailVerifiedAt) {
    console.log("Already verified — nothing to do.");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
    select: { emailVerifiedAt: true },
  });
  console.log(`✅ Confirmed ${user.email} → emailVerifiedAt: ${updated.emailVerifiedAt?.toISOString()}`);
}

main()
  .catch((err) => {
    console.error("[confirm-user]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
