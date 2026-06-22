import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden, notFound } from "@/lib/api/errors";
import { canAccessConversation, conversationContext } from "@/lib/conversations";

// GET /api/conversations/{id}/context (DOK-221).
// Role-aware header context for a thread: the participants bar (host + guest)
// plus a concrete reference to the underlying transaction — for a stay, which
// apartment the guest booked and its Keys cost; for a swap, both homes of the
// exchange. The viewer's `role` and `isPrincipal` drive what the UI emphasises.
export async function GET(req: Request, { params }: RouteContext<"/api/conversations/[id]/context">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  const ctx = await conversationContext(id, session.userId);
  if (!ctx) return notFound("Conversation not found");
  return NextResponse.json(ctx);
}
