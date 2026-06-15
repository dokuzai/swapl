import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import { confirmKeysStay, KeysStayError } from "@/lib/keys/stay";
import { prisma } from "@/lib/db";
import { sendPush, pushTemplates } from "@/lib/push";

// POST /api/keys/stays/{id}/confirm — host accepts a pending stay. The guest's
// held Keys become a real spend, the host earns them, and a cover policy is
// issued (lib/insurance, reused). Only the host may confirm.
export async function POST(req: Request, { params }: RouteContext<"/api/keys/stays/[id]/confirm">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  try {
    const result = await confirmKeysStay(id, session.userId);
    const stay = await prisma.keysStay.findUnique({ where: { id }, select: { guestId: true } });
    if (stay) sendPush(stay.guestId, pushTemplates.keysStayConfirmed(id)).catch(() => {});
    return NextResponse.json({ ok: true, stayId: result.id, keysCost: result.keysCost });
  } catch (err) {
    if (err instanceof KeysStayError) {
      if (err.code === "STAY_NOT_FOUND") return notFound("Stay not found");
      if (err.code === "NOT_HOST") return forbidden("Only the host can confirm");
      return unprocessable(err.message, { code: err.code });
    }
    throw err;
  }
}
