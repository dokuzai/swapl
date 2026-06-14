// POST /api/agreements/{id}/check-in — a party records arrival. Idempotent per
// party; the event moves the derived phase to IN_PROGRESS and notifies the
// other side. See lib/trip/check-event.ts for the shared logic.

import { handleCheckEvent } from "@/lib/trip/check-event";

export async function POST(req: Request, { params }: RouteContext<"/api/agreements/[id]/check-in">) {
  const { id } = await params;
  return handleCheckEvent(req, id, "checkin");
}
