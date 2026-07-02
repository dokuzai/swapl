// One-off SWP-007 migration helper: encrypt legacy plaintext home-guide wifi
// passwords and swap key codes at rest.
//
// Usage (prod uses the postgres client + unpooled URL, per CLAUDE.md):
//   AI_KEY_ENCRYPTION_SECRET="..." sw_DATABASE_URL_UNPOOLED="..." tsx scripts/backfill-home-secrets.ts
//
// SQL migrations cannot encrypt legacy values (encryption depends on a runtime
// secret). Run this AFTER deploying the encryption code. Idempotent — re-running
// skips already-encrypted rows.

import { prisma } from "@/lib/db";
import { backfillPlaintextWifiPasswords, backfillPlaintextKeyCodes } from "@/lib/home-secrets-backfill";

async function main() {
  const wifi = await backfillPlaintextWifiPasswords(prisma);
  console.log(
    `wifiPassword backfill: scanned=${wifi.scanned} encrypted=${wifi.encrypted} skippedEncrypted=${wifi.skippedEncrypted}`,
  );
  const keys = await backfillPlaintextKeyCodes(prisma);
  console.log(
    `keyCode backfill: scanned=${keys.scanned} encrypted=${keys.encrypted} skippedEncrypted=${keys.skippedEncrypted}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-home-secrets]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
