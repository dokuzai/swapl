// One-off helper: create (or reset) the App Store reviewer demo account.
// Idempotent — re-running just resets the password + re-verifies the account.
//
// Usage (against prod, same flow as make-admin.ts):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED value>" npx tsx scripts/create-reviewer-user.ts
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client
//
// Override the defaults with env vars if needed:
//   REVIEWER_EMAIL=... REVIEWER_PASSWORD=... npx tsx scripts/create-reviewer-user.ts

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/passwords";

async function main() {
  const email = (process.env.REVIEWER_EMAIL ?? "reviewer@swapl.demo").trim().toLowerCase();
  const password = process.env.REVIEWER_PASSWORD ?? "reviewer";
  const now = new Date();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "App Reviewer",
      passwordHash,
      verified: true,
      verifiedAt: now,
      emailVerifiedAt: now,
    },
    update: {
      passwordHash,
      verified: true,
      verifiedAt: now,
      emailVerifiedAt: now,
      suspendedAt: null,
    },
    select: { id: true, email: true, verified: true },
  });

  console.log(`✅ Reviewer account ready: ${user.email} (id ${user.id}, verified ${user.verified})`);
  console.log(`   Password: ${password}`);
}

main()
  .catch((err) => {
    console.error("Failed to create reviewer user:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
