import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden, invalidInput, apiError } from "@/lib/api/errors";
import { canAccessConversation, conversationParticipantIds } from "@/lib/conversations";
import { requestDateChange, DateChangeError } from "@/lib/date-change";
import { sendPush } from "@/lib/push";

// POST /api/conversations/{id}/change-request (DOK-221, Phase 3).
// A principal proposes new dates for the booking. Body: { dateFrom, dateTo }.
const bodySchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});

export async function POST(req: Request, { params }: RouteContext<"/api/conversations/[id]/change-request">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } });
  try {
    await requestDateChange(id, session.userId, parsed.data.dateFrom, parsed.data.dateTo, me?.name ?? null);
  } catch (err) {
    if (err instanceof DateChangeError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 422;
      return apiError(status, err.message, { code: err.code });
    }
    throw err;
  }

  // Notify the other participant(s) — best-effort.
  const others = (await conversationParticipantIds(id)).filter((u) => u !== session.userId);
  for (const u of others) {
    sendPush(u, {
      title: `${me?.name ?? "Someone"} proposed new dates`,
      body: "Open the conversation to accept or decline.",
      data: { kind: "conversationMessage", conversationId: id, deepLink: `swapl://conversations/${id}` },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
