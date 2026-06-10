// GET /api/favorites — the signed-in user's favorited listings (wishlist),
// active listings only, newest favorite first.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { toDTO } from "@/lib/listing-utils";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.userId, listing: { isActive: true } },
    orderBy: { createdAt: "desc" },
    include: { listing: { include: { user: { select: { name: true } } } } },
  });

  const items = favorites.map((f) =>
    toDTO(f.listing, { includeAddress: f.listing.userId === session.userId })
  );
  return NextResponse.json({ items });
}
