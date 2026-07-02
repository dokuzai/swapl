// SWP-007: home-guide wifi passwords + swap key codes are encrypted at rest.
// The crypto primitive is covered by ai-key-encryption.test.ts; here we verify
// the two backfill helpers (encrypt legacy plaintext, skip already-encrypted,
// idempotent, per-field key-code counting).

import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/crypto";
import {
  backfillPlaintextWifiPasswords,
  backfillPlaintextKeyCodes,
} from "@/lib/home-secrets-backfill";

beforeAll(() => {
  process.env.AI_KEY_ENCRYPTION_SECRET = "test-encryption-secret-at-least-32-bytes-long";
});

describe("wifiPassword backfill", () => {
  it("encrypts plaintext rows, skips already-encrypted, and is idempotent", async () => {
    const rows = [
      { id: "g-1", wifiPassword: "sunset2026" },
      { id: "g-2", wifiPassword: encryptSecret("already") },
    ];
    const updates: Array<{ id: string; wifiPassword: string }> = [];
    const db = {
      listingHomeGuide: {
        async findMany() {
          return rows;
        },
        async update({ where, data }: { where: { id: string }; data: { wifiPassword: string } }) {
          updates.push({ id: where.id, wifiPassword: data.wifiPassword });
        },
      },
      swapAgreement: { async findMany() { return []; }, async update() {} },
    };

    const result = await backfillPlaintextWifiPasswords(db as never);
    expect(result).toEqual({ scanned: 2, encrypted: 1, skippedEncrypted: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("g-1");
    expect(isEncrypted(updates[0].wifiPassword)).toBe(true);
    expect(decryptSecret(updates[0].wifiPassword)).toBe("sunset2026");
  });
});

describe("keyCode backfill", () => {
  it("encrypts each plaintext code independently and skips fully-encrypted rows", async () => {
    const rows = [
      { id: "a-1", keyCode1: "1234", keyCode2: "5678" }, // both plaintext
      { id: "a-2", keyCode1: encryptSecret("9999"), keyCode2: "0000" }, // mixed
      { id: "a-3", keyCode1: encryptSecret("1111"), keyCode2: encryptSecret("2222") }, // both encrypted
    ];
    const updates: Array<{ id: string; data: { keyCode1?: string; keyCode2?: string } }> = [];
    const db = {
      listingHomeGuide: { async findMany() { return []; }, async update() {} },
      swapAgreement: {
        async findMany() {
          return rows;
        },
        async update({ where, data }: { where: { id: string }; data: { keyCode1?: string; keyCode2?: string } }) {
          updates.push({ id: where.id, data });
        },
      },
    };

    const result = await backfillPlaintextKeyCodes(db as never);
    // a-1 encrypts 2 codes, a-2 encrypts 1, a-3 skipped → encrypted=3, skipped=1.
    expect(result).toEqual({ scanned: 3, encrypted: 3, skippedEncrypted: 1 });
    expect(updates.map((u) => u.id)).toEqual(["a-1", "a-2"]);
    // a-1: both fields written, both decrypt to originals.
    expect(decryptSecret(updates[0].data.keyCode1!)).toBe("1234");
    expect(decryptSecret(updates[0].data.keyCode2!)).toBe("5678");
    // a-2: only keyCode2 (the plaintext one) written; keyCode1 left untouched.
    expect(updates[1].data.keyCode1).toBeUndefined();
    expect(decryptSecret(updates[1].data.keyCode2!)).toBe("0000");
  });
});
