// GET /api/favorites/ids — just the favorited listing ids. Cheap endpoint the
// mobile apps poll to sync heart states on browse cards.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.userId },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ids: favorites.map((f) => f.listingId) });
}
