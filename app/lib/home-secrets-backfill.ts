// SWP-007 backfill: encrypt legacy plaintext home-guide wifi passwords and swap
// key codes at rest. Mirrors lib/ai-key-backfill.ts — idempotent via isEncrypted
// (a re-run skips already-encrypted rows). MUST run AFTER the encryption code is
// deployed (backfill needs the runtime secret; SQL can't encrypt).

import { encryptSecret, isEncrypted } from "@/lib/crypto";

export type SecretBackfillResult = {
  scanned: number;
  encrypted: number;
  skippedEncrypted: number;
};

type GuideRow = { id: string; wifiPassword: string | null };
type AgreementRow = { id: string; keyCode1: string | null; keyCode2: string | null };

type BackfillDb = {
  listingHomeGuide: {
    findMany(args: {
      where: { wifiPassword: { not: null } };
      select: { id: true; wifiPassword: true };
    }): Promise<GuideRow[]>;
    update(args: { where: { id: string }; data: { wifiPassword: string } }): Promise<unknown>;
  };
  swapAgreement: {
    findMany(args: {
      where: { OR: Array<{ keyCode1: { not: null } } | { keyCode2: { not: null } }> };
      select: { id: true; keyCode1: true; keyCode2: true };
    }): Promise<AgreementRow[]>;
    update(args: {
      where: { id: string };
      data: { keyCode1?: string; keyCode2?: string };
    }): Promise<unknown>;
  };
};

/** Encrypt any plaintext ListingHomeGuide.wifiPassword. */
export async function backfillPlaintextWifiPasswords(db: BackfillDb): Promise<SecretBackfillResult> {
  const rows = await db.listingHomeGuide.findMany({
    where: { wifiPassword: { not: null } },
    select: { id: true, wifiPassword: true },
  });
  let encrypted = 0;
  let skippedEncrypted = 0;
  for (const row of rows) {
    const pw = row.wifiPassword;
    if (!pw) continue;
    if (isEncrypted(pw)) {
      skippedEncrypted++;
      continue;
    }
    await db.listingHomeGuide.update({ where: { id: row.id }, data: { wifiPassword: encryptSecret(pw) } });
    encrypted++;
  }
  return { scanned: rows.length, encrypted, skippedEncrypted };
}

/** Encrypt any plaintext SwapAgreement.keyCode1 / keyCode2 (each independently). */
export async function backfillPlaintextKeyCodes(db: BackfillDb): Promise<SecretBackfillResult> {
  const rows = await db.swapAgreement.findMany({
    where: { OR: [{ keyCode1: { not: null } }, { keyCode2: { not: null } }] },
    select: { id: true, keyCode1: true, keyCode2: true },
  });
  let encrypted = 0;
  let skippedEncrypted = 0;
  for (const row of rows) {
    const data: { keyCode1?: string; keyCode2?: string } = {};
    if (row.keyCode1 && !isEncrypted(row.keyCode1)) data.keyCode1 = encryptSecret(row.keyCode1);
    if (row.keyCode2 && !isEncrypted(row.keyCode2)) data.keyCode2 = encryptSecret(row.keyCode2);
    // Count each code that needed encrypting; a fully-encrypted row is skipped.
    const changed = Object.keys(data).length;
    if (changed === 0) {
      skippedEncrypted++;
      continue;
    }
    await db.swapAgreement.update({ where: { id: row.id }, data });
    encrypted += changed;
  }
  return { scanned: rows.length, encrypted, skippedEncrypted };
}
