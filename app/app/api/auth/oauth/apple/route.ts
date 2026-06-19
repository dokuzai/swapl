// POST /api/auth/oauth/apple — Sign in with Apple.
//
// Apple includes `email` only on the FIRST authorization, so returning users
// are resolved purely by OAuthAccount(provider="apple", sub) — the
// find-or-create handles that as step 1. When the email is genuinely missing
// AND the sub is unknown we cannot create a sane account, so we ask the
// client to revoke + re-authorize (Apple then resends the email).

import { prisma } from "@/lib/db";
import { oauthAppleSchema } from "@/lib/validators";
import { verifyAppleIdentityToken } from "@/lib/auth/oauth/apple";
import { appleBundleIds } from "@/lib/auth/oauth/config";
import { findOrCreateOAuthUser } from "@/lib/auth/oauth/account";
import { respondWithSession } from "@/lib/auth/respond";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput, unprocessable } from "@/lib/api/errors";
import {
  attributeSignupByCode,
  linkRefereeByEmail,
  linkRefereeByInviteToken,
} from "@/lib/growth/referrals";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const bundleIds = appleBundleIds();
  if (bundleIds.length === 0) {
    return apiError(503, "Apple sign-in is not configured on this deployment.");
  }

  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`oauth-apple:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }

  const body = await req.json().catch(() => null);
  const parsed = oauthAppleSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }

  const verified = await verifyAppleIdentityToken(parsed.data.identityToken, bundleIds);
  if (!verified.ok) {
    return apiError(401, "Invalid Apple token");
  }
  const { providerUserId, email, emailVerified } = verified.identity;

  // Returning Apple identity? Resolve by sub without needing the email.
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: "apple", providerUserId } },
  });
  if (!existing && !email) {
    // First time we see this sub and Apple omitted the email — the client
    // must re-request authorization (Settings → Apple ID → Sign-In & Security
    // → revoke, then sign in again).
    return unprocessable("APPLE_EMAIL_MISSING", {
      message: "Apple did not share an email for this account. Revoke swapl under Settings → Apple ID → Sign in with Apple, then try again.",
    });
  }

  const user = await findOrCreateOAuthUser({
    provider: "apple",
    providerUserId,
    // For returning users the email is ignored (resolved by sub); the
    // placeholder keeps the type satisfied without ever being written.
    email: email ?? `apple-${providerUserId}@invalid.local`,
    emailVerified: Boolean(email) && emailVerified,
    // fullName arrives client-side only on first authorization → used solely
    // at account creation (findOrCreateOAuthUser ignores it for existing users).
    name: parsed.data.fullName ?? null,
  });
  if (user.suspendedAt) {
    return accountSuspended();
  }

  if (user.created) {
    await prisma.betaSignup
      .updateMany({ where: { email: user.email, userId: null }, data: { userId: user.id } })
      .catch((err: unknown) => console.error("[oauth-apple:link-beta-signup]", err));

    // Growth engine (DOK-157): referral attribution on first-time signup. The
    // reward credits later, on identity verification (anti-farm gate).
    try {
      if (parsed.data.ref) await attributeSignupByCode(user.id, parsed.data.ref);
      if (parsed.data.invite) await linkRefereeByInviteToken(user.id, parsed.data.invite);
      if (email) await linkRefereeByEmail(user.id, user.email);
    } catch (err) {
      console.error("[oauth-apple:referral-attribution]", err);
    }
  }

  return respondWithSession(user, parsed.data.platform, parsed.data.appVersion);
}
