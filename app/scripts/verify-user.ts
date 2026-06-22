// One-off helper: manually mark a user as fully verified by email address —
// both EMAIL (User.emailVerifiedAt) and IDENTITY/KYC (User.verified +
// User.verifiedAt). Use when you need to grant a real person the verified
// badge without running them through the email link + Didit flow.
//
// This sets exactly the fields the real flows set:
//   - email link  → emailVerifiedAt   (app/api/auth/verify-email/[token]/route.ts)
//   - Didit "approved" → verified=true, verifiedAt  (lib/verification/didit.ts)
// It does NOT create an IdentityVerification row and does NOT trigger the Keys
// welcome bonus / referral credit that a genuine Didit approval would. It's a
// pure account-state correction.
//
// Usage (against prod, like make-admin / confirm-user):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED value>" npx tsx scripts/verify-user.ts gertbey@icloud.it
//   npx prisma generate --schema prisma/schema.prisma   # restore local sqlite client
//
// Flags:
//   --check         print current status only, change nothing
//   --email-only    set just emailVerifiedAt
//   --identity-only set just verified + verifiedAt

import { prisma } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const emailOnly = args.includes("--email-only");
  const identityOnly = args.includes("--identity-only");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: tsx scripts/verify-user.ts <email> [--check] [--email-only] [--identity-only]");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, verified: true, verifiedAt: true, emailVerifiedAt: true },
  });
  if (!user) {
    console.error(`No user found with email ${email}. Check the address the account actually signed up with.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Found: ${user.email} (${user.name ?? "no name"})\n` +
      `  emailVerifiedAt: ${user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : "null (not verified)"}\n` +
      `  verified (identity): ${user.verified}` +
      `${user.verifiedAt ? ` @ ${user.verifiedAt.toISOString()}` : ""}`,
  );
  if (checkOnly) return;

  const now = new Date();
  const data: { emailVerifiedAt?: Date; verified?: boolean; verifiedAt?: Date } = {};
  const doEmail = !identityOnly;
  const doIdentity = !emailOnly;
  if (doEmail && !user.emailVerifiedAt) data.emailVerifiedAt = now;
  if (doIdentity && !user.verified) {
    data.verified = true;
    data.verifiedAt = user.verifiedAt ?? now;
  }

  if (Object.keys(data).length === 0) {
    console.log("Nothing to change — already verified for the requested fields.");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { emailVerifiedAt: true, verified: true, verifiedAt: true },
  });
  console.log(
    `✅ Updated ${user.email}\n` +
      `  emailVerifiedAt: ${updated.emailVerifiedAt?.toISOString() ?? "null"}\n` +
      `  verified: ${updated.verified}${updated.verifiedAt ? ` @ ${updated.verifiedAt.toISOString()}` : ""}`,
  );
}

main()
  .catch((err) => {
    console.error("[verify-user]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
