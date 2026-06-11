// Decides which social/OTP login options the WEB pages render.
//
// Runs in server components only (login/register pages) and reads the same
// env vars the API routes gate on, so a button never appears unless the
// matching endpoint would accept the request. The returned object is
// serialisable and safe to pass to client components: it carries only
// public identifiers (client ids, bot username), never secrets.
//
// Google/Apple need BOTH the public client id (the browser SDK requires it)
// and that id to be among the server-side accepted audiences — otherwise the
// posted token would be rejected with 401, which is worse than no button.

import {
  googleClientIds,
  appleBundleIds,
  telegramConfig,
  twilioConfig,
} from "./oauth/config";

export type WebAuthProviders = {
  /** Google Identity Services web client id, or null when disabled. */
  google: { clientId: string } | null;
  /** Sign in with Apple web Services ID, or null when disabled. */
  apple: { clientId: string } | null;
  /** Telegram Login Widget bot username (without @), or null when disabled. */
  telegram: { botUsername: string } | null;
  /** Email OTP always works (Resend or console fallback in dev). */
  emailOtp: true;
  /** SMS OTP — only when Twilio is fully configured. */
  phone: boolean;
  /** Passkeys (WebAuthn) — no external credentials needed, always on. */
  passkey: true;
};

export function webAuthProviders(): WebAuthProviders {
  const googleWebId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
  const appleServicesId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim() || null;
  const tg = telegramConfig();

  return {
    google:
      googleWebId && googleClientIds().includes(googleWebId)
        ? { clientId: googleWebId }
        : null,
    apple:
      appleServicesId && appleBundleIds().includes(appleServicesId)
        ? { clientId: appleServicesId }
        : null,
    telegram: tg
      ? { botUsername: (process.env.NEXT_PUBLIC_TELEGRAM_BOT?.trim() || tg.botUsername).replace(/^@/, "") }
      : null,
    emailOtp: true,
    phone: twilioConfig() !== null,
    passkey: true,
  };
}
