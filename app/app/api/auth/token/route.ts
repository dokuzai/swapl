// Mobile auth: exchange email + password for an opaque Bearer token.
// Web continues to use POST /api/auth/login (cookie). Both share verifyPassword
// and the same Zod credentials schema; only the response shape differs.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenIssueSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/passwords";
import { issueAuthToken } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = tokenIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password, platform, appVersion } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const issued = await issueAuthToken(user.id, platform, appVersion);
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
  });
}
