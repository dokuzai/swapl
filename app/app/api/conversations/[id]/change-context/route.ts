import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, forbidden, apiError } from "@/lib/api/errors";
import { canAccessConversation } from "@/lib/conversations";
import { dateChangeContext, DateChangeError } from "@/lib/date-change";

// GET /api/conversations/{id}/change-context (DOK-221, Phase 3).
// The availability snapshot for the date-change picker (taken dates greyed out,
// excluding this booking's own dates) + the booking's current dates to preselect.
export async function GET(req: Request, { params }: RouteContext<"/api/conversations/[id]/change-context">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  if (!(await canAccessConversation(id, session.userId))) return forbidden();

  try {
    const ctx = await dateChangeContext(id, session.userId);
    return NextResponse.json(ctx);
  } catch (err) {
    if (err instanceof DateChangeError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 422;
      return apiError(status, err.message, { code: err.code });
    }
    throw err;
  }
}
