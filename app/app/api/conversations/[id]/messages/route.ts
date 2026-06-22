import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden, invalidInput } from "@/lib/api/errors";
import {
  canAccessConversation,
  conversationParticipantIds,
  getMessages,
  postMessage,
  markConversationRead,
} from "@/lib/conversations";
import { pendingChangeDTO } from "@/lib/date-change";
import { sendPush } from "@/lib/push";

// Unified conversation thread (DOK-221), keyed by conversationId so it serves
// both swap- and stay-backed transactions. GET returns the timeline (messages +
// system events) oldest→newest; POST sends a member's text/photo message.

const sendSchema = z.object({
  body: z.string().max(4000).optional(),
  photos: z.array(z.string().url()).max(10).optional(),
});

export async function GET(req: Request, { params }: RouteContext<"/api/conversations/[id]/messages">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const cursor = url.searchParams.get("cursor");
  const markRead = url.searchParams.get("markRead") !== "false";

  const page = await getMessages(id, session.userId, { limit, cursor });
  if (markRead) await markConversationRead(id, session.userId).catch(() => {});

  // Surface any in-flight date-change request (DOK-221 Phase 3) so the client
  // can show the Accept/Decline (or "waiting") action card.
  const convo = await prisma.conversation.findUnique({
    where: { id },
    select: { pendingChangeFrom: true, pendingChangeTo: true, pendingChangeById: true, pendingChangeAt: true },
  });
  const pendingChange = convo ? pendingChangeDTO(convo, session.userId) : null;
  return NextResponse.json({ ...page, pendingChange });
}

export async function POST(req: Request, { params }: RouteContext<"/api/conversations/[id]/messages">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });
  const body = parsed.data.body?.trim() ?? "";
  const photos = parsed.data.photos ?? [];
  if (!body && photos.length === 0) return invalidInput("Message cannot be empty");

  const msg = await postMessage(id, session.userId, body || null, photos);
  await markConversationRead(id, session.userId).catch(() => {});

  // Notify the other participant(s) — best-effort.
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } });
  const others = (await conversationParticipantIds(id)).filter((u) => u !== session.userId);
  for (const u of others) {
    sendPush(u, {
      title: `${me?.name ?? "New"} sent a message`,
      body: body || "Sent a photo",
      data: { kind: "conversationMessage", conversationId: id, deepLink: `swapl://conversations/${id}` },
    }).catch(() => {});
  }

  return NextResponse.json({
    id: msg.id,
    kind: "text",
    authorId: session.userId,
    mine: true,
    body: msg.body,
    photos,
    eventType: null,
    eventMeta: null,
    readAt: null,
    createdAt: msg.createdAt.toISOString(),
  });
}
