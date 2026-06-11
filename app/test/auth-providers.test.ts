// GET /api/auth/providers — env-gated provider flags.

import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "GOOGLE_OAUTH_CLIENT_IDS",
  "APPLE_SIGNIN_BUNDLE_IDS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllEnvs();
});

import { GET } from "@/app/api/auth/providers/route";

describe("GET /api/auth/providers", () => {
  it("reports only password + emailOtp when nothing is configured", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      password: true,
      google: false,
      apple: false,
      telegram: { enabled: false },
      emailOtp: true,
      phone: false,
      passkey: true,
    });
  });

  it("enables providers based on env", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_IDS = "web.apps.googleusercontent.com, ios.apps.googleusercontent.com";
    process.env.APPLE_SIGNIN_BUNDLE_IDS = "fun.swapl.app";
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_BOT_USERNAME = "swapl_bot";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM = "+15550001111";

    const body = await (await GET()).json();
    expect(body).toEqual({
      password: true,
      google: true,
      apple: true,
      telegram: { enabled: true, botUsername: "swapl_bot" },
      emailOtp: true,
      phone: true,
      passkey: true,
    });
  });

  it("keeps telegram disabled when only the token is set (no username)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    const body = await (await GET()).json();
    expect(body.telegram).toEqual({ enabled: false });
  });
});
