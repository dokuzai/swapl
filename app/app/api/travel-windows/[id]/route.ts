import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function DELETE(req: Request, { params }: RouteContext<"/api/travel-windows/[id]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const w = await prisma.travelWindow.findUnique({ where: { id } });
  if (!w || w.userId !== session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.travelWindow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
