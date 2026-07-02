import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/abilities";

const schema = z.object({ action: z.enum(["suspend", "reactivate"]) });

// POST /api/admin/users/[id] — suspend or reactivate a member.
// Suspending also revokes every live mobile bearer token; the web cookie is
// stateless, so login + proposal routes re-check `suspendedAt` server-side.
export async function POST(req: Request, { params }: RouteContext<"/api/admin/users/[id]">) {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, suspendedAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "suspend") {
    if (user.id === me.id) {
      return NextResponse.json({ error: "You cannot suspend yourself" }, { status: 400 });
    }
    if (user.suspendedAt) {
      return NextResponse.json({ error: "Already suspended" }, { status: 409 });
    }
    // Bump the session epoch to kill live WEB cookies immediately (SEC-AUTH-02),
    // alongside revoking mobile bearers below — no longer relying only on the
    // per-endpoint suspendedAt re-check.
    await prisma.user.update({
      where: { id },
      data: { suspendedAt: new Date(), sessionEpoch: { increment: 1 } },
    });
    // Kill live mobile sessions immediately.
    await prisma.authToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // reactivate
  if (!user.suspendedAt) {
    return NextResponse.json({ error: "Not suspended" }, { status: 409 });
  }
  await prisma.user.update({ where: { id }, data: { suspendedAt: null } });
  return NextResponse.json({ ok: true });
}
