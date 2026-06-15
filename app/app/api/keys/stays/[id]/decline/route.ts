import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import { releaseKeysStay, KeysStayError } from "@/lib/keys/stay";
import { prisma } from "@/lib/db";
import { sendPush, pushTemplates } from "@/lib/push";

// POST /api/keys/stays/{id}/decline — host rejects a pending stay; the guest's
// held Keys are released back to their wallet. Only the host may decline.
export async function POST(req: Request, { params }: RouteContext<"/api/keys/stays/[id]/decline">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  try {
    const result = await releaseKeysStay(id, session.userId, "declined");
    const stay = await prisma.keysStay.findUnique({ where: { id }, select: { guestId: true } });
    if (stay) sendPush(stay.guestId, pushTemplates.keysStayDeclined(id)).catch(() => {});
    return NextResponse.json({ ok: true, stayId: result.id });
  } catch (err) {
    if (err instanceof KeysStayError) {
      if (err.code === "STAY_NOT_FOUND") return notFound("Stay not found");
      if (err.code === "NOT_HOST") return forbidden("Only the host can decline");
      return unprocessable(err.message, { code: err.code });
    }
    throw err;
  }
}
