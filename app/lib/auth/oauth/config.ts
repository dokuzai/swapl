// Env-gated provider configuration for multi-provider auth.
//
// Every provider degrades gracefully: when its env vars are unset the
// matching endpoint returns 503 and GET /api/auth/providers reports it as
// disabled so clients hide the button. Read lazily (functions, not consts)
// so tests can flip process.env per case.

export function googleClientIds(): string[] {
  // Comma-separated list: web client id, iOS client id, Android client id.
  // All of them are acceptable `aud` values for the Google ID token.
  return (process.env.GOOGLE_OAUTH_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function appleBundleIds(): string[] {
  // Comma-separated list: app bundle id (native) + Services ID (web).
  // All of them are acceptable `aud` values for the Apple identity token.
  return (process.env.APPLE_SIGNIN_BUNDLE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type TelegramConfig = { botToken: string; botUsername: string };

export function telegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botToken || !botUsername) return null;
  return { botToken, botUsername };
}

export type TwilioConfig = { accountSid: string; authToken: string; from: string };

export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

/** Shape returned by GET /api/auth/providers — clients hide disabled buttons. */
export function providersStatus() {
  const tg = telegramConfig();
  return {
    password: true,
    google: googleClientIds().length > 0,
    apple: appleBundleIds().length > 0,
    telegram: tg ? { enabled: true as const, botUsername: tg.botUsername } : { enabled: false as const },
    // Email OTP always works: the email adapter falls back to console in dev.
    emailOtp: true,
    phone: twilioConfig() !== null,
    // WebAuthn needs no external credentials — always available.
    passkey: true,
  };
}
