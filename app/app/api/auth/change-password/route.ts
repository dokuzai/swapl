// POST { currentPassword?, newPassword } — authenticated password change
// (cookie or bearer). Verifies the current password when one exists; users
// who signed up via social/OTP (passwordHash null) set their first password
// without providing one. On success every OTHER mobile AuthToken is revoked
// (the bearer used for this request, if any, stays valid) and a security
// email is sent best-effort.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { apiError, forbidden, invalidInput, unauthenticated } from "@/lib/api/errors";

const HOUR_MS = 60 * 60 * 1000;

const schema = z.object({
  // nullish: kotlinx-serialization clients send explicit nulls for omitted fields.
  currentPassword: z.string().max(128).nullish(),
  newPassword: z.string().min(6).max(128),
});

function bearerTokenHash(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth) : null;
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // 5 attempts / hour per user — generous for humans, hostile to brute force
  // of the current password from a stolen session.
  const rl = await checkRateLimitDurable(`change-password:${session.userId}`, 5, HOUR_MS);
  if (!rl.ok) {
    return apiError(429, "Too many password changes. Try again in an hour.");
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidInput("Password must be 6–128 characters.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return unauthenticated();

  if (user.passwordHash) {
    const ok = await verifyPassword(parsed.data.currentPassword ?? "", user.passwordHash);
    if (!ok) return forbidden("Current password is incorrect.");
  }
  // passwordHash null → social/OTP-only account setting its first password;
  // the live session is the proof of ownership, no current password needed.

  const passwordHash = await hashPassword(parsed.data.newPassword);
  // Bump the session epoch so every previously-issued WEB cookie is invalidated
  // too (SEC-AUTH-02) — the AuthToken revocation below covers mobile bearers.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionEpoch: { increment: 1 } },
  });

  // Security invariant: a password change logs out every other device. Keep
  // the bearer that performed the change. Web cookies are now revoked via the
  // sessionEpoch bump above, so the acting web session must re-authenticate.
  const currentTokenHash = bearerTokenHash(req);
  await prisma.authToken.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  // Best-effort notification — never block or fail the request on email.
  try {
    sendEmail(emailTemplates.passwordChanged(user.email)).catch((err) =>
      console.error("[change-password:email]", err)
    );
  } catch (err) {
    console.error("[change-password:email]", err);
  }

  return NextResponse.json({ ok: true });
}
