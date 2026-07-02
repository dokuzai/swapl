// POST /api/auth/otp/verify — exchange a 6-digit code for a session.
//
// Find-or-create by destination: email codes resolve by User.email (a code
// delivered to the inbox proves ownership → emailVerifiedAt is set on
// creation), SMS codes by User.phone. Emits the SAME session as every other
// login: cookie for web, bearer for native.

import { prisma } from "@/lib/db";
import { otpVerifySchema } from "@/lib/validators";
import { verifyOtp, normaliseDestination } from "@/lib/auth/otp";
import { respondWithSession } from "@/lib/auth/respond";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput } from "@/lib/api/errors";
import {
  attributeSignupByCode,
  linkRefereeByEmail,
  linkRefereeByInviteToken,
} from "@/lib/growth/referrals";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`otp-verify:${ip}`, 30, 15 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many attempts. Try again in a few minutes.");
  }

  const body = await req.json().catch(() => null);
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }
  const isEmail = parsed.data.destination.includes("@");
  const destination = normaliseDestination(isEmail ? "email" : "sms", parsed.data.destination);

  const outcome = await verifyOtp(destination, parsed.data.code);
  if (!outcome.ok) {
    if (outcome.reason === "too-many-attempts") {
      return apiError(429, "Too many wrong codes. Request a new one.");
    }
    // Deliberately uniform: don't leak whether a code exists vs. expired.
    return apiError(401, "Invalid or expired code");
  }

  // Find-or-create keyed on the proven destination.
  let user =
    outcome.channel === "email"
      ? await prisma.user.findUnique({ where: { email: destination } })
      : await prisma.user.findUnique({ where: { phone: destination } });

  if (user?.suspendedAt) {
    return accountSuspended();
  }

  const isNewAccount = !user;
  if (!user) {
    user =
      outcome.channel === "email"
        ? await prisma.user.create({
            data: {
              email: destination,
              name: destination.split("@")[0],
              // The code reached this inbox → ownership proven.
              emailVerifiedAt: new Date(),
            },
          })
        : await prisma.user.create({
            data: {
              // User.email is required+unique; synthetic placeholder for
              // phone-only accounts, never emailed (emailVerifiedAt null).
              // The profile UI will ask for a real email later.
              email: `${destination.replace(/^\+/, "ph")}@phone.local`,
              phone: destination,
              name: null,
            },
          });
  } else if (outcome.channel === "email" && !user.emailVerifiedAt) {
    // Existing account logging in via email code → inbox proven now.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  // Growth engine (DOK-157): record referral attribution on first-time signup.
  // The two-sided Keys reward only credits later, when this user verifies their
  // identity (anti-farm gate). Best-effort — login must never fail on this.
  if (isNewAccount) {
    try {
      if (parsed.data.ref) await attributeSignupByCode(user.id, parsed.data.ref);
      if (parsed.data.invite) await linkRefereeByInviteToken(user.id, parsed.data.invite);
      if (outcome.channel === "email") await linkRefereeByEmail(user.id, user.email);
    } catch (err) {
      console.error("[otp:referral-attribution]", err);
    }
  }

  return respondWithSession(user, parsed.data.platform, parsed.data.appVersion);
}
