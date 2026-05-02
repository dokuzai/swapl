// GET-only verification consumer. We use a GET so the link in the email
// works on first click (no JS required). Successful verification redirects
// to /verify?status=ok; failures go to /verify?status=expired|used|invalid.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeToken } from "@/lib/auth/tokens";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(_req: Request, { params }: RouteContext<"/api/auth/verify-email/[token]">) {
  const { token } = await params;
  const result = await consumeToken(token, "verify");
  if (!result.ok) {
    const status = result.reason === "expired" ? "expired" : result.reason === "used" ? "used" : "invalid";
    return NextResponse.redirect(`${APP_URL}/verify?status=${status}`, { status: 302 });
  }
  await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerifiedAt: new Date() },
  });
  return NextResponse.redirect(`${APP_URL}/verify?status=ok`, { status: 302 });
}
