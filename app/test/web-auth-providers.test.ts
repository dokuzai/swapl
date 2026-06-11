// lib/auth/web-providers — env-gated provider buttons for the web pages.

import { afterEach, describe, expect, it } from "vitest";

const ENV_KEYS = [
  "GOOGLE_OAUTH_CLIENT_IDS",
  "APPLE_SIGNIN_BUNDLE_IDS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_APPLE_CLIENT_ID",
  "NEXT_PUBLIC_TELEGRAM_BOT",
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

import { webAuthProviders } from "@/lib/auth/web-providers";

describe("webAuthProviders", () => {
  it("only offers email OTP when nothing is configured", () => {
    expect(webAuthProviders()).toEqual({
      google: null,
      apple: null,
      telegram: null,
      emailOtp: true,
      phone: false,
      passkey: true,
    });
  });

  it("enables every provider when fully configured", () => {
    process.env.GOOGLE_OAUTH_CLIENT_IDS = "web.apps.googleusercontent.com, ios.apps.googleusercontent.com";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "web.apps.googleusercontent.com";
    process.env.APPLE_SIGNIN_BUNDLE_IDS = "fun.swapl.app,fun.swapl.web";
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = "fun.swapl.web";
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_BOT_USERNAME = "swapl_bot";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM = "+15550001111";

    expect(webAuthProviders()).toEqual({
      google: { clientId: "web.apps.googleusercontent.com" },
      apple: { clientId: "fun.swapl.web" },
      telegram: { botUsername: "swapl_bot" },
      emailOtp: true,
      phone: true,
      passkey: true,
    });
  });

  it("hides Google when the public id is not an accepted server audience", () => {
    process.env.GOOGLE_OAUTH_CLIENT_IDS = "other.apps.googleusercontent.com";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "web.apps.googleusercontent.com";
    expect(webAuthProviders().google).toBeNull();
  });

  it("hides Google/Apple when only the public id is set (backend unconfigured)", () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "web.apps.googleusercontent.com";
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = "fun.swapl.web";
    const p = webAuthProviders();
    expect(p.google).toBeNull();
    expect(p.apple).toBeNull();
  });

  it("hides Apple when only the backend is configured (no public Services ID)", () => {
    process.env.APPLE_SIGNIN_BUNDLE_IDS = "fun.swapl.app,fun.swapl.web";
    expect(webAuthProviders().apple).toBeNull();
  });

  it("telegram follows the server config and strips a leading @ override", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_BOT_USERNAME = "swapl_bot";
    process.env.NEXT_PUBLIC_TELEGRAM_BOT = "@swapl_other_bot";
    expect(webAuthProviders().telegram).toEqual({ botUsername: "swapl_other_bot" });
  });

  it("telegram stays hidden when the bot token is missing", () => {
    process.env.NEXT_PUBLIC_TELEGRAM_BOT = "swapl_bot";
    expect(webAuthProviders().telegram).toBeNull();
  });
});
