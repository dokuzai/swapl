// POST /api/agreements/{id}/check-out — a party records departure. Idempotent
// per party; notifies the other side. See lib/trip/check-event.ts.

import { handleCheckEvent } from "@/lib/trip/check-event";

export async function POST(req: Request, { params }: RouteContext<"/api/agreements/[id]/check-out">) {
  const { id } = await params;
  return handleCheckEvent(req, id, "checkout");
}
