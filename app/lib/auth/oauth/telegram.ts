// Telegram Login Widget verification.
//
// Telegram signs the auth payload with HMAC-SHA256 where the key is
// SHA256(bot_token) and the message is the data-check-string: all fields
// except `hash`, sorted alphabetically, joined as "key=value" with "\n".
// https://core.telegram.org/widgets/login#checking-authorization
//
// Pure crypto + clock checks — fully unit-testable without network.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_AUTH_AGE_SECONDS = 10 * 60; // reject payloads older than 10 minutes

export type TelegramAuthData = {
  id: number | string;
  auth_date: number | string;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type TelegramIdentity = {
  providerUserId: string; // Telegram numeric id, stringified
  name: string | null;
  avatar: string | null;
};

export type TelegramVerifyResult =
  | { ok: true; identity: TelegramIdentity }
  | { ok: false; reason: string };

export function verifyTelegramAuth(
  authData: Record<string, unknown>,
  botToken: string,
  nowMs: number = Date.now()
): TelegramVerifyResult {
  const hash = authData.hash;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { ok: false, reason: "missing-hash" };
  }
  // Data-check-string: every field except `hash`, sorted, "key=value" lines.
  const dataCheckString = Object.keys(authData)
    .filter((k) => k !== "hash" && authData[k] !== undefined && authData[k] !== null)
    .sort()
    .map((k) => `${k}=${String(authData[k])}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(hash.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid-hash" };
  }
  const authDate = Number(authData.auth_date);
  if (!Number.isFinite(authDate) || nowMs / 1000 - authDate > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }
  const id = authData.id;
  if ((typeof id !== "number" && typeof id !== "string") || String(id) === "") {
    return { ok: false, reason: "missing-id" };
  }
  const firstName = typeof authData.first_name === "string" ? authData.first_name : null;
  const lastName = typeof authData.last_name === "string" ? authData.last_name : null;
  const username = typeof authData.username === "string" ? authData.username : null;
  const name = firstName ? [firstName, lastName].filter(Boolean).join(" ") : username;
  return {
    ok: true,
    identity: {
      providerUserId: String(id),
      name,
      avatar: typeof authData.photo_url === "string" ? authData.photo_url : null,
    },
  };
}

/**
 * Telegram never shares an email, but User.email is required + unique in the
 * schema. We mint a synthetic, undeliverable placeholder; emailVerifiedAt
 * stays null so no transactional email is ever sent to it. The profile UI
 * should later prompt these users for a real email (not implemented here).
 */
export function telegramPlaceholderEmail(providerUserId: string): string {
  return `tg${providerUserId}@telegram.local`;
}
