// Mobile auth: exchange email + password for an opaque Bearer token.
// Web continues to use POST /api/auth/login (cookie). Both share verifyPassword
// and the same Zod credentials schema; only the response shape differs.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenIssueSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/passwords";
import { issueAuthToken } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";
import { checkRateLimitDurable, resetRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = tokenIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { password, platform, appVersion } = parsed.data;
  const email = normaliseEmail(parsed.data.email);

  // Brute-force throttle (same dual-layer defence as web login).
  const ip = clientIpFromRequest(req);
  const [ipRl, emailRl] = await Promise.all([
    checkRateLimitDurable(`token:ip:${ip}`, 30, 5 * MIN_MS),
    checkRateLimitDurable(`token:email:${email}`, 10, 15 * MIN_MS),
  ]);
  if (!ipRl.ok || !emailRl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (user.suspendedAt) {
    return NextResponse.json(
      { error: "ACCOUNT_SUSPENDED", message: "This account has been suspended. Contact support@swapl.com." },
      { status: 403 }
    );
  }

  // Successful login clears the brute-force counters.
  await Promise.all([
    resetRateLimitDurable(`token:ip:${ip}`, 5 * MIN_MS),
    resetRateLimitDurable(`token:email:${email}`, 15 * MIN_MS),
  ]).catch(() => {});

  const issued = await issueAuthToken(user.id, platform, appVersion);
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
  });
}
