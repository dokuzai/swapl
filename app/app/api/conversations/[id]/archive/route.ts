import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden, invalidInput } from "@/lib/api/errors";
import { canAccessConversation, setConversationArchived } from "@/lib/conversations";

// POST /api/conversations/{id}/archive — per-user archive toggle (DOK-221).
// Body: { archived: boolean }. Hides/restores the thread in the caller's list
// only; the other participant is unaffected. Only participants may call.
const bodySchema = z.object({ archived: z.boolean() });

export async function POST(req: Request, { params }: RouteContext<"/api/conversations/[id]/archive">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  await setConversationArchived(id, session.userId, parsed.data.archived);
  return NextResponse.json({ ok: true, archived: parsed.data.archived });
}
