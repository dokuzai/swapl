import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function DELETE(_req: Request, { params }: RouteContext<"/api/saved-searches/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const ss = await prisma.savedSearch.findUnique({ where: { id } });
  if (!ss || ss.userId !== session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.savedSearch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
