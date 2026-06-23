// Find-or-create for provider sign-ins — the unified identity model.
//
// Resolution order (never creates duplicates):
//   1. OAuthAccount(provider, providerUserId) → returning user.
//   2. Same email, provider-verified → link the provider to the existing
//      account (and mark the email inbox-confirmed: the provider proved it).
//   3. Otherwise create a fresh user and link the provider.
//
// Linking by email is only safe when the provider verified the address —
// callers must pass emailVerified=false for unverified/synthetic emails
// (e.g. Telegram placeholders), which skips step 2.

import { prisma } from "@/lib/db";
import { normaliseEmail } from "@/lib/auth/tokens";

export type ProviderProfile = {
  provider: "google" | "apple" | "telegram";
  providerUserId: string;
  email: string; // real (provider-verified) or synthetic placeholder
  emailVerified: boolean;
  name?: string | null;
  avatar?: string | null;
};

export type ResolvedUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  suspendedAt: Date | null;
  emailVerifiedAt: Date | null;
  created: boolean;
};

export async function findOrCreateOAuthUser(profile: ProviderProfile): Promise<ResolvedUser> {
  const email = normaliseEmail(profile.email);

  // 1. Returning provider identity.
  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    },
    include: { user: true },
  });
  if (existingAccount) {
    let u = existingAccount.user;
    // Self-heal: accounts created before Apple/Google sign-in marked the inbox
    // verified come back with emailVerifiedAt = null and stay stuck behind the
    // "confirm your email" banner. A returning Apple/Google identity is proof the
    // provider still controls this (always-real, never synthetic) email, so
    // backfill it now. Telegram is excluded — it uses synthetic placeholders.
    if (!u.emailVerifiedAt && (profile.provider === "apple" || profile.provider === "google")) {
      u = await prisma.user.update({
        where: { id: u.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
      suspendedAt: u.suspendedAt,
      emailVerifiedAt: u.emailVerifiedAt,
      created: false,
    };
  }

  // 2. Link to the existing account with the same (provider-verified) email.
  if (profile.emailVerified) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: {
          userId: byEmail.id,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      });
      // The provider verified this inbox; backfill emailVerifiedAt if the
      // user never clicked our own verification link.
      const patch: { emailVerifiedAt?: Date; name?: string; avatar?: string } = {};
      if (!byEmail.emailVerifiedAt) patch.emailVerifiedAt = new Date();
      if (!byEmail.name && profile.name) patch.name = profile.name;
      if (!byEmail.avatar && profile.avatar) patch.avatar = profile.avatar;
      const user = Object.keys(patch).length
        ? await prisma.user.update({ where: { id: byEmail.id }, data: patch })
        : byEmail;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        suspendedAt: user.suspendedAt,
        emailVerifiedAt: user.emailVerifiedAt,
        created: false,
      };
    }
  }

  // 3. Brand-new user. emailVerifiedAt is set only for provider-verified
  // emails; synthetic placeholders (Telegram) stay unverified so we never
  // email them.
  const user = await prisma.user.create({
    data: {
      email,
      name: profile.name ?? null,
      avatar: profile.avatar ?? null,
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
      oauthAccounts: {
        create: { provider: profile.provider, providerUserId: profile.providerUserId },
      },
    },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    suspendedAt: user.suspendedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    created: true,
  };
}
