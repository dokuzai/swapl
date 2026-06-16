import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { credentialsSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/passwords";
import { setSession } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";
import { checkRateLimitDurable, clientIpFromRequest, resetRateLimitDurable } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput } from "@/lib/api/errors";
import { activateInvitedParticipants } from "@/lib/conversation/participants";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }
  const email = normaliseEmail(parsed.data.email);

  // Brute-force throttle. The per-IP gate is best-effort (x-forwarded-for is
  // spoofable), so the real defence is the per-ACCOUNT gate keyed on the email —
  // it can't be bypassed by rotating source IPs. Both use the durable limiter.
  const ip = clientIpFromRequest(req);
  const [ipRl, emailRl] = await Promise.all([
    checkRateLimitDurable(`login:ip:${ip}`, 30, 5 * MIN_MS),
    checkRateLimitDurable(`login:email:${email}`, 10, 15 * MIN_MS),
  ]);
  if (!ipRl.ok || !emailRl.ok) {
    return apiError(429, "Too many login attempts. Try again in a few minutes.");
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return apiError(401, "Invalid email or password");
  }
  if (user.suspendedAt) {
    return accountSuspended();
  }
  await setSession({ userId: user.id, email: user.email, name: user.name });

  // A successful login clears the brute-force counters for this account/IP, so a
  // legitimate user is never locked out by their own (eventually correct)
  // attempts — only FAILED attempts accumulate toward the lockout. Best-effort.
  await Promise.all([
    resetRateLimitDurable(`login:ip:${ip}`, 5 * MIN_MS),
    resetRateLimitDurable(`login:email:${email}`, 15 * MIN_MS),
  ]);

  // DOK-187 — materialise any pending swap-conversation invites addressed to
  // this email into active guest seats. Best-effort; login must never fail here.
  activateInvitedParticipants(user.id, user.email).catch((err) =>
    console.error("[login:activate-participants]", err)
  );

  return NextResponse.json({
    ok: true,
    userId: user.id,
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
