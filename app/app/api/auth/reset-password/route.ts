// POST { token, password } — exchanges a reset token for a new password.
// Logs the user in on success so they don't have to re-type credentials.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/passwords";
import { setSession } from "@/lib/auth/session";
import { consumeToken } from "@/lib/auth/tokens";

const schema = z.object({
  token: z.string().min(16),
  password: z.string().min(6).max(128),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await consumeToken(parsed.data.token, "reset");
  if (!result.ok) {
    const reason = result.reason === "expired" ? "This reset link has expired — request a new one."
      : result.reason === "used" ? "This reset link was already used."
      : "Invalid or unknown reset link.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  // The reset flow also confirms the email — anyone with inbox access has
  // proven they own it.
  const user = await prisma.user.update({
    where: { id: result.userId },
    data: {
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
  await setSession({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({ ok: true });
}
