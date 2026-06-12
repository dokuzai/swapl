// POST /api/admin/reviews/[id] — hide | restore a swap review (DOK-149).
// Hidden reviews vanish from the public profile and its aggregates; restore
// brings them back. Idempotent-friendly: re-applying the current state 409s
// so the admin UI notices a stale list.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/auth/abilities";

const schema = z.object({ action: z.enum(["hide", "restore"]) });

export async function POST(req: Request, { params }: RouteContext<"/api/admin/reviews/[id]">) {
  let me;
  try {
    me = await requireAdminFromRequest(req);
  } catch (err) {
    const unauthenticated = err instanceof Error && err.message === "UNAUTHENTICATED";
    return NextResponse.json(
      { error: unauthenticated ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: unauthenticated ? 401 : 403 }
    );
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const review = await prisma.swapReview.findUnique({ where: { id } });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextStatus = parsed.data.action === "hide" ? "hidden" : "published";
  if (review.status === nextStatus) {
    return NextResponse.json({ error: "Already in that state" }, { status: 409 });
  }

  const updated = await prisma.swapReview.update({
    where: { id },
    data: { status: nextStatus, moderatedAt: new Date(), moderatedById: me.id },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
