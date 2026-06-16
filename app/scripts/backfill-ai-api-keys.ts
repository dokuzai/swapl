// One-off DOK-197 migration helper.
//
// Usage:
//   AI_KEY_ENCRYPTION_SECRET="..." DATABASE_URL="..." tsx scripts/backfill-ai-api-keys.ts
//
// SQL migrations cannot encrypt legacy values because encryption depends on a
// runtime secret. Run this after deploying the encryption code and before
// treating DB dumps/backups as free of legacy plaintext provider keys.

import { prisma } from "@/lib/db";
import { backfillPlaintextAiKeys } from "@/lib/ai-key-backfill";

async function main() {
  const result = await backfillPlaintextAiKeys(prisma);
  console.log(
    `AI key backfill complete: scanned=${result.scanned} encrypted=${result.encrypted} skippedEncrypted=${result.skippedEncrypted}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-ai-api-keys]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
