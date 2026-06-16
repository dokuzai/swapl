// DOK-197: user-supplied AI provider keys are encrypted at rest. We verify the
// crypto primitive (roundtrip, tamper detection, legacy plaintext passthrough)
// and that the provider layer transparently decrypts a stored key.

import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/crypto";
import { resolveAIConfig } from "@/lib/ai/providers";
import { backfillPlaintextAiKeys } from "@/lib/ai-key-backfill";

beforeAll(() => {
  // Exercise the real env-keyed path rather than the dev fallback.
  process.env.AI_KEY_ENCRYPTION_SECRET = "test-encryption-secret-at-least-32-bytes-long";
});

describe("encryptSecret / decryptSecret (DOK-197)", () => {
  it("roundtrips a secret and never stores it in plaintext", () => {
    const secret = "sk-ant-supersecret-value-123";
    const enc = encryptSecret(secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces a fresh IV per call (no deterministic ciphertext)", () => {
    expect(encryptSecret("same-input")).not.toBe(encryptSecret("same-input"));
  });

  it("returns legacy plaintext values untouched", () => {
    expect(decryptSecret("sk-legacy-plaintext")).toBe("sk-legacy-plaintext");
  });

  it("returns null for empty/missing input", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const enc = encryptSecret("sk-tamper-me");
    // Flip a character in the ciphertext segment.
    const tampered = enc.slice(0, -1) + (enc.endsWith("A") ? "B" : "A");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("resolveAIConfig decrypts the stored user key", () => {
  it("decrypts an encrypted override key before use", () => {
    const config = resolveAIConfig({
      userOverride: { provider: "anthropic", model: null, apiKey: encryptSecret("sk-real-key") },
    });
    expect(config?.apiKey).toBe("sk-real-key");
  });

  it("still accepts a legacy plaintext override key", () => {
    const config = resolveAIConfig({
      userOverride: { provider: "anthropic", model: null, apiKey: "sk-legacy" },
    });
    expect(config?.apiKey).toBe("sk-legacy");
  });
});

describe("legacy AI key backfill", () => {
  it("encrypts plaintext rows and leaves encrypted rows alone", async () => {
    const encrypted = encryptSecret("sk-existing");
    const rows = [
      { id: "u-1", aiApiKey: "sk-legacy" },
      { id: "u-2", aiApiKey: encrypted },
    ];
    const updates: Array<{ id: string; aiApiKey: string }> = [];
    const result = await backfillPlaintextAiKeys({
      user: {
        async findMany() {
          return rows;
        },
        async update({ where, data }) {
          updates.push({ id: where.id, aiApiKey: data.aiApiKey });
        },
      },
    });

    expect(result).toEqual({ scanned: 2, encrypted: 1, skippedEncrypted: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("u-1");
    expect(isEncrypted(updates[0].aiApiKey)).toBe(true);
    expect(decryptSecret(updates[0].aiApiKey)).toBe("sk-legacy");
  });
});
