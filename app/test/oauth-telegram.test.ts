// Telegram Login Widget verification — pure HMAC, fully hermetic.

import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { verifyTelegramAuth, telegramPlaceholderEmail } from "@/lib/auth/oauth/telegram";

const BOT_TOKEN = "12345:test-bot-token";

function sign(data: Record<string, string | number>): Record<string, string | number> {
  const dataCheckString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return { ...data, hash };
}

function freshAuthDate(): number {
  return Math.floor(Date.now() / 1000) - 30;
}

describe("verifyTelegramAuth", () => {
  it("accepts a correctly signed, fresh payload and extracts the identity", () => {
    const payload = sign({
      id: 987654321,
      first_name: "Ada",
      last_name: "Lovelace",
      username: "ada",
      photo_url: "https://t.me/i/userpic/ada.jpg",
      auth_date: freshAuthDate(),
    });
    const res = verifyTelegramAuth(payload, BOT_TOKEN);
    expect(res).toEqual({
      ok: true,
      identity: {
        providerUserId: "987654321",
        name: "Ada Lovelace",
        avatar: "https://t.me/i/userpic/ada.jpg",
      },
    });
  });

  it("rejects a tampered payload", () => {
    const payload = sign({ id: 1, first_name: "Ada", auth_date: freshAuthDate() });
    payload.first_name = "Eve";
    const res = verifyTelegramAuth(payload, BOT_TOKEN);
    expect(res).toEqual({ ok: false, reason: "invalid-hash" });
  });

  it("rejects a payload signed with another bot's token", () => {
    const otherKey = createHash("sha256").update("999:other").digest();
    const data: Record<string, string | number> = { id: 1, auth_date: freshAuthDate() };
    const dcs = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
    data.hash = createHmac("sha256", otherKey).update(dcs).digest("hex");
    expect(verifyTelegramAuth(data, BOT_TOKEN)).toEqual({ ok: false, reason: "invalid-hash" });
  });

  it("rejects payloads older than 10 minutes", () => {
    const payload = sign({ id: 1, auth_date: Math.floor(Date.now() / 1000) - 11 * 60 });
    expect(verifyTelegramAuth(payload, BOT_TOKEN)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a missing hash", () => {
    expect(verifyTelegramAuth({ id: 1, auth_date: freshAuthDate() }, BOT_TOKEN)).toEqual({
      ok: false,
      reason: "missing-hash",
    });
  });

  it("falls back to username when first_name is absent", () => {
    const payload = sign({ id: 2, username: "grace", auth_date: freshAuthDate() });
    const res = verifyTelegramAuth(payload, BOT_TOKEN);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.identity.name).toBe("grace");
  });

  it("builds the synthetic placeholder email", () => {
    expect(telegramPlaceholderEmail("42")).toBe("tg42@telegram.local");
  });
});
