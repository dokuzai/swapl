import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden } from "@/lib/api/errors";
import { canAccessConversation, markConversationRead } from "@/lib/conversations";

// POST /api/conversations/{id}/read — clear the caller's unread cursor (DOK-221).
export async function POST(req: Request, { params }: RouteContext<"/api/conversations/[id]/read">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();
  await markConversationRead(id, session.userId);
  return NextResponse.json({ ok: true });
}
