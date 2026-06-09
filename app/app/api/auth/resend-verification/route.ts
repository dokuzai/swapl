// Re-issues + resends the verification email for the current user. Soft
// rate-limited per user.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rl = checkRateLimit(`verify-resend:${session.userId}`, 5, HOUR_MS);
  if (!rl.ok) return NextResponse.json({ error: "Too many emails sent. Try again in an hour." }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const token = await issueToken(user.id, "verify");
  await sendEmail(emailTemplates.verifyEmail(user.email, token));
  return NextResponse.json({ ok: true });
}
