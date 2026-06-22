import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden, invalidInput, apiError } from "@/lib/api/errors";
import { canAccessConversation, conversationParticipantIds } from "@/lib/conversations";
import { respondDateChange, DateChangeError } from "@/lib/date-change";
import { sendPush } from "@/lib/push";

// POST /api/conversations/{id}/change-response (DOK-221, Phase 3).
// Accept or decline the pending date change. Body: { accept: boolean }. On
// accept the booking is moved (with re-validation + Keys re-pricing).
const bodySchema = z.object({ accept: z.boolean() });

export async function POST(req: Request, { params }: RouteContext<"/api/conversations/[id]/change-response">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  let applied: { from: string; to: string } | null = null;
  try {
    applied = await respondDateChange(id, session.userId, parsed.data.accept);
  } catch (err) {
    if (err instanceof DateChangeError) {
      const status = err.code === "FORBIDDEN" || err.code === "OWN_REQUEST" ? 403 : err.code === "NONE_PENDING" ? 409 : 422;
      return apiError(status, err.message, { code: err.code });
    }
    throw err;
  }

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } });
  const verb = parsed.data.accept ? "accepted the new dates" : "declined the new dates";
  const others = (await conversationParticipantIds(id)).filter((u) => u !== session.userId);
  for (const u of others) {
    sendPush(u, {
      title: `${me?.name ?? "Someone"} ${verb}`,
      body: "Open the conversation to see the timeline.",
      data: { kind: "conversationMessage", conversationId: id, deepLink: `swapl://conversations/${id}` },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, accepted: parsed.data.accept, applied });
}
