// GET /api/conversations — the mobile chat list (DOK-154).
//
// Returns the viewer's swap threads sorted by most recent activity, each with
// the counterpart, last message preview + time, unread count, and swap status.
// Reuses getConversations (shared with the web three-pane inbox) so the list
// stays consistent across surfaces.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getConversations } from "@/app/swaps/conversations";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const conversations = await getConversations(session.userId);
  // Most recently active thread first: a fresh message outranks an old proposal
  // update. Threads with no messages fall back to the proposal's updatedAt.
  conversations.sort((a, b) => {
    const at = a.lastMessageAt ?? a.updatedAt;
    const bt = b.lastMessageAt ?? b.updatedAt;
    return bt.localeCompare(at);
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  return NextResponse.json({ conversations, totalUnread });
}
