// AI proposals for a saved travel window (DOK-161): real, available,
// date-compatible homes ranked by match score + travel profile, each annotated
// with the swap modes (direct swap + Stay-with-Keys) it supports for the dates.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { composeWindowProposals, WindowProposalError } from "@/lib/ai/window-proposals";

export async function GET(req: Request, { params }: RouteContext<"/api/travel-windows/[id]/proposals">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const window = await prisma.travelWindow.findUnique({ where: { id } });
  if (!window || window.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await composeWindowProposals(window);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WindowProposalError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
