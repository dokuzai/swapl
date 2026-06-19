// Always replies 200 — never confirms or denies the email exists, to avoid
// enumeration. If the email matches a user, we issue a reset token and
// send the email; otherwise we drop silently.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueToken, normaliseEmail } from "@/lib/auth/tokens";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  // Per-IP rate limit (20/hour) keeps spammers from flooding inboxes.
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`forgot:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const email = normaliseEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.passwordHash) {
    const token = await issueToken(user.id, "reset");
    sendEmail(emailTemplates.resetPassword(user.email, token)).catch((err) =>
      console.error("[forgot-password]", err),
    );
  }
  return NextResponse.json({ ok: true });
}
