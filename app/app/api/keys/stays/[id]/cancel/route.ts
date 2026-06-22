import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import { releaseKeysStay, KeysStayError } from "@/lib/keys/stay";
import { recordStayEvent } from "@/lib/conversations";

// POST /api/keys/stays/{id}/cancel — guest cancels their own pending stay
// before the host acts; the held Keys are released back to the guest. Only the
// guest may cancel.
export async function POST(req: Request, { params }: RouteContext<"/api/keys/stays/[id]/cancel">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  try {
    const result = await releaseKeysStay(id, session.userId, "cancelled");
    recordStayEvent(id, "cancelled").catch(() => {});
    return NextResponse.json({ ok: true, stayId: result.id });
  } catch (err) {
    if (err instanceof KeysStayError) {
      if (err.code === "STAY_NOT_FOUND") return notFound("Stay not found");
      if (err.code === "NOT_GUEST") return forbidden("Only the guest can cancel");
      return unprocessable(err.message, { code: err.code });
    }
    throw err;
  }
}
