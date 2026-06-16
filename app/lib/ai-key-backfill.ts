import { encryptSecret, isEncrypted } from "@/lib/crypto";

type UserRow = { id: string; aiApiKey: string | null };
type BackfillDb = {
  user: {
    findMany(args: {
      where: { aiApiKey: { not: null } };
      select: { id: true; aiApiKey: true };
    }): Promise<UserRow[]>;
    update(args: { where: { id: string }; data: { aiApiKey: string } }): Promise<unknown>;
  };
};

export type AiKeyBackfillResult = {
  scanned: number;
  encrypted: number;
  skippedEncrypted: number;
};

export async function backfillPlaintextAiKeys(db: BackfillDb): Promise<AiKeyBackfillResult> {
  const users = await db.user.findMany({
    where: { aiApiKey: { not: null } },
    select: { id: true, aiApiKey: true },
  });

  let encrypted = 0;
  let skippedEncrypted = 0;

  for (const user of users) {
    const key = user.aiApiKey;
    if (!key) continue;
    if (isEncrypted(key)) {
      skippedEncrypted++;
      continue;
    }
    await db.user.update({
      where: { id: user.id },
      data: { aiApiKey: encryptSecret(key) },
    });
    encrypted++;
  }

  return { scanned: users.length, encrypted, skippedEncrypted };
}
