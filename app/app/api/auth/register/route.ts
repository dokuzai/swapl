import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { credentialsSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth/passwords";
import { setSession, issueAuthToken } from "@/lib/auth/session";
import { issueToken, normaliseEmail } from "@/lib/auth/tokens";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { apiError, invalidInput } from "@/lib/api/errors";

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  // Per-IP rate limit (10 registrations / hour) — durable across serverless
  // invocations via Upstash, falling back to in-memory when unconfigured.
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`register:${ip}`, 10, HOUR_MS);
  if (!rl.ok) {
    return apiError(429, "Too many sign-ups from this network. Try again in an hour.");
  }

  const body = await req.json().catch(() => null);

  // Captcha (web). No-op when TURNSTILE_SECRET_KEY is unset; native clients use
  // App Attest / Play Integrity instead (added alongside their attestation).
  const turnstileToken = (body as { turnstileToken?: unknown } | null)?.turnstileToken;
  if (!(await verifyTurnstile(typeof turnstileToken === "string" ? turnstileToken : null, ip))) {
    return invalidInput("Captcha verification failed.");
  }

  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }

  const email = normaliseEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return apiError(409, "Email already in use");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: email.split("@")[0] },
  });

  // If this email is on the beta waitlist, link the signup row to the new
  // account so the funnel (waitlist → invited → registered) stays measurable.
  // Best-effort — registration must not fail on a marketing-table hiccup.
  try {
    await prisma.betaSignup.updateMany({
      where: { email, userId: null },
      data: { userId: user.id },
    });
  } catch (err) {
    console.error("[register:link-beta-signup]", err);
  }

  // Issue + send the verification email. The token is one-shot, hashed in
  // the DB. Send is best-effort — registration succeeds even if Resend
  // fails (the user can request a resend from /account).
  try {
    const token = await issueToken(user.id, "verify");
    sendEmail(emailTemplates.verifyEmail(user.email, token)).catch((err) =>
      console.error("[register:verify-email]", err)
    );
  } catch (err) {
    console.error("[register:issue-token]", err);
  }

  await setSession({ userId: user.id, email: user.email, name: user.name });

  // Native clients (iOS/Android) can't use the web cookie. If they identify
  // their platform, hand back a Bearer token so sign-up is a single round-trip
  // (mirrors POST /api/auth/token). Web callers omit `platform` and get the cookie.
  const rawPlatform = (body as { platform?: unknown } | null)?.platform;
  if (rawPlatform === "ios" || rawPlatform === "android" || rawPlatform === "web-pwa") {
    const rawVersion = (body as { appVersion?: unknown } | null)?.appVersion;
    const appVersion = typeof rawVersion === "string" ? rawVersion : undefined;
    const issued = await issueAuthToken(user.id, rawPlatform, appVersion);
    return NextResponse.json({
      ok: true,
      userId: user.id,
      token: issued.token,
      expiresAt: issued.expiresAt,
    });
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
