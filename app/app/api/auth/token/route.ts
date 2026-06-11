// Mobile auth: exchange email + password for an opaque Bearer token.
// Web continues to use POST /api/auth/login (cookie). Both share verifyPassword
// and the same Zod credentials schema; only the response shape differs.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenIssueSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/passwords";
import { issueAuthToken } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = tokenIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { password, platform, appVersion } = parsed.data;
  const email = normaliseEmail(parsed.data.email);
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
  const issued = await issueAuthToken(user.id, platform, appVersion);
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
  });
}
