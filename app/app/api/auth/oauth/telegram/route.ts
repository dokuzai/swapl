// POST /api/auth/oauth/telegram — Telegram Login Widget.
//
// The widget hands the client a signed payload (HMAC-SHA256 keyed with
// SHA256(bot_token)); we verify the hash and freshness server-side.
// Telegram never shares an email, so the account is keyed purely on
// OAuthAccount(provider="telegram", id). New users get a synthetic
// `tg<id>@telegram.local` placeholder email (User.email is required+unique)
// with emailVerifiedAt = null so we never send mail to it; the profile UI
// will prompt for a real email later (not implemented here).

import { oauthTelegramSchema } from "@/lib/validators";
import { verifyTelegramAuth, telegramPlaceholderEmail } from "@/lib/auth/oauth/telegram";
import { telegramConfig } from "@/lib/auth/oauth/config";
import { findOrCreateOAuthUser } from "@/lib/auth/oauth/account";
import { respondWithSession } from "@/lib/auth/respond";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput } from "@/lib/api/errors";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const cfg = telegramConfig();
  if (!cfg) {
    return apiError(503, "Telegram sign-in is not configured on this deployment.");
  }

  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`oauth-telegram:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }

  const body = await req.json().catch(() => null);
  const parsed = oauthTelegramSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }

  const verified = verifyTelegramAuth(parsed.data.authData, cfg.botToken);
  if (!verified.ok) {
    return apiError(401, "Invalid Telegram authentication");
  }

  const user = await findOrCreateOAuthUser({
    provider: "telegram",
    providerUserId: verified.identity.providerUserId,
    email: telegramPlaceholderEmail(verified.identity.providerUserId),
    emailVerified: false, // synthetic placeholder — never link-by-email, never emailed
    name: verified.identity.name,
    avatar: verified.identity.avatar,
  });
  if (user.suspendedAt) {
    return accountSuspended();
  }

  return respondWithSession(user, parsed.data.platform, parsed.data.appVersion);
}
