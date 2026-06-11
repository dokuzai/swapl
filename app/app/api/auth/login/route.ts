import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { credentialsSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/passwords";
import { setSession } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, accountSuspended, invalidInput } from "@/lib/api/errors";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  // Per-IP login throttle — keeps brute force expensive.
  const ip = clientIpFromRequest(req);
  const rl = checkRateLimit(`login:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return apiError(429, "Too many login attempts. Try again in a few minutes.");
  }

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }
  const email = normaliseEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return apiError(401, "Invalid email or password");
  }
  if (user.suspendedAt) {
    return accountSuspended();
  }
  await setSession({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({
    ok: true,
    userId: user.id,
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
