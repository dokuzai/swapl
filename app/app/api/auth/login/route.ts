import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { credentialsSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/passwords";
import { setSession } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  // Per-IP login throttle — keeps brute force expensive.
  const ip = clientIpFromRequest(req);
  const rl = checkRateLimit(`login:${ip}`, 30, 5 * MIN_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const email = normaliseEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (user.suspendedAt) {
    return NextResponse.json(
      { error: "ACCOUNT_SUSPENDED", message: "This account has been suspended. Contact support@swapl.com." },
      { status: 403 }
    );
  }
  await setSession({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({
    ok: true,
    userId: user.id,
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
