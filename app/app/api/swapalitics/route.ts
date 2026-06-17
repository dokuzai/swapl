import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { computeSwapalitics } from "@/lib/swapalitics";

// GET /api/swapalitics — the signed-in user's travel + impact stats and badges.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const stats = await computeSwapalitics(session.userId);
  return NextResponse.json(stats);
}
