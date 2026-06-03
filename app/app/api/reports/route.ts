import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reportSchema } from "@/lib/validators";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await prisma.report.create({
    data: {
      reporterId: session.userId,
      reason: parsed.data.reason,
      detail: parsed.data.detail,
      listingId: parsed.data.listingId,
      targetUserId: parsed.data.targetUserId,
    },
  });
  return NextResponse.json({ ok: true });
}
