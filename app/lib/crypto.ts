// Symmetric encryption-at-rest for secrets we must be able to read back (unlike
// passwords, which are one-way hashed). Currently used for user-supplied AI
// provider API keys (DOK-197): a DB dump, backup, or admin SQL session must not
// expose third-party credentials in plaintext.
//
// AES-256-GCM gives us confidentiality + an authentication tag, so tampering is
// detected on decrypt. The key is derived from an env secret the same way the
// session signing key is resolved (see lib/auth/session.ts): fail closed in
// production, insecure dev fallback otherwise.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Stored ciphertext is tagged with a version so the format can evolve and so a
// legacy *plaintext* value (rows written before this feature) is distinguishable
// and read back untouched.
const PREFIX = "enc:v1:";
const KEY_SALT = "swapl:secret-encryption:v1"; // static salt — fine for KDF from a high-entropy secret

const DEV_FALLBACK_SECRET = "dev-secret-please-change-this-to-32-random-bytes-minimum";
let warnedWeakSecret = false;

function encryptionKey(): Buffer {
  // Prefer a dedicated secret; fall back to SESSION_SECRET so a single strong
  // env unlocks both. NOTE: rotating this secret makes existing ciphertext
  // undecryptable — rotate with a re-encryption migration, not in place.
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return scryptSync(secret, KEY_SALT, 32);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AI_KEY_ENCRYPTION_SECRET (or SESSION_SECRET) must be set to a strong value (>= 32 chars) in production to encrypt stored secrets",
    );
  }
  if (!warnedWeakSecret) {
    console.warn("[crypto] encryption secret missing or too short — using an INSECURE dev fallback. Never deploy this.");
    warnedWeakSecret = true;
  }
  return scryptSync(DEV_FALLBACK_SECRET, KEY_SALT, 32);
}

// Encrypt a non-empty plaintext secret. Returns a self-describing string safe to
// store in a plain `String` DB column.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

// Decrypt a stored secret. Values written before this feature (no prefix) are
// legacy plaintext and returned as-is so reads keep working until rotated.
// Returns null for null/empty input.
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ct) throw new Error("decryptSecret: malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
