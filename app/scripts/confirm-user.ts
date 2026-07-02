// One-off helper: manually confirm (verify) a user's email — by email address
// or by name.
//
// Use this when a user registered but never received the verification email,
// so they're stuck with emailVerifiedAt = null. This does exactly what the
// real verify-email link does (app/api/auth/verify-email/[token]/route.ts):
// it sets User.emailVerifiedAt to the current time.
//
// Usage (against prod, like make-admin / the AI-key backfill):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED>" npx tsx scripts/confirm-user.ts user@example.com
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED>" npx tsx scripts/confirm-user.ts --name "Mauro Caporaso"
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client
//
// --name does a case-insensitive partial match. If it matches more than one
// account it lists them and refuses to act — re-run with the exact email of
// the right one. Pass --check to print status without changing anything.

import { prisma } from "@/lib/db";

type FoundUser = { id: string; email: string; name: string | null; emailVerifiedAt: Date | null };

async function resolveUsers(args: string[]): Promise<FoundUser[] | null> {
  const select = { id: true, email: true, name: true, emailVerifiedAt: true } as const;

  const nameIdx = args.indexOf("--name");
  if (nameIdx !== -1) {
    const name = args[nameIdx + 1]?.trim();
    if (!name) {
      console.error('Usage: tsx scripts/confirm-user.ts --name "Full Name" [--check]');
      return null;
    }
    // Case-insensitive match filtered in JS so this works on both the Postgres
    // (prod) and SQLite (local) clients — SQLite's Prisma client has no
    // `mode: "insensitive"`. User tables for a beta app are small enough that
    // scanning names client-side is fine.
    const needle = name.toLowerCase();
    const candidates = await prisma.user.findMany({
      where: { name: { not: null } },
      select,
    });
    return candidates.filter((u) => u.name?.toLowerCase().includes(needle));
  }

  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: tsx scripts/confirm-user.ts <email | --name "Full Name"> [--check]');
    return null;
  }
  const user = await prisma.user.findUnique({ where: { email }, select });
  if (!user) {
    console.error(`No user found with email ${email}. Check the address the account actually signed up with.`);
    return [];
  }
  return [user];
}

function describe(u: FoundUser): string {
  return `${u.email} (${u.name ?? "no name"}) — emailVerifiedAt: ${
    u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : "null (not verified)"
  }`;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");

  const users = await resolveUsers(args);
  if (users === null) {
    process.exitCode = 1;
    return;
  }
  if (users.length === 0) {
    process.exitCode = 1;
    return;
  }
  if (users.length > 1) {
    console.error(`Ambiguous — ${users.length} accounts match. Re-run with the exact email of the right one:`);
    for (const u of users) console.error(`  • ${describe(u)}`);
    process.exitCode = 1;
    return;
  }

  const user = users[0];
  console.log(`Found: ${describe(user)}`);
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
