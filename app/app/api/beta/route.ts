import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { betaSignupSchema } from "@/lib/validators";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  // Public funnel — durable per-IP limit so a single source can't flood the
  // waitlist (20 signups / hour / IP).
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`beta:${ip}`, 20, HOUR_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many sign-ups from this network. Try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Captcha (web). No-op when TURNSTILE_SECRET_KEY is unset.
  const turnstileToken = (body as { turnstileToken?: unknown } | null)?.turnstileToken;
  if (!(await verifyTurnstile(typeof turnstileToken === "string" ? turnstileToken : null, ip))) {
    return NextResponse.json({ error: "Captcha verification failed." }, { status: 400 });
  }

  const parsed = betaSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { email, source, medium, campaign, term, content, landingPage, referrer } = parsed.data;
  // Idempotent — `email` is unique.
  await prisma.betaSignup.upsert({
    where: { email },
    create: { email, source, medium, campaign, term, content, landingPage, referrer },
    update: {
      source,
      medium,
      campaign,
      term,
      content,
      landingPage,
      referrer,
    },
  });

  // Fire and forget the welcome email.
  sendEmail(emailTemplates.betaWelcome(email)).catch((err) => console.error("[beta:email]", err));

  return NextResponse.json({ ok: true });
}
