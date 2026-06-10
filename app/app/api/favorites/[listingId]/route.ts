// PUT/DELETE /api/favorites/[listingId] — favorite / unfavorite a listing.
// Both are idempotent: re-favoriting or un-favoriting something that isn't
// favorited is a no-op success.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function PUT(req: Request, { params }: RouteContext<"/api/favorites/[listingId]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { listingId } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, isActive: true },
  });
  if (!listing || !listing.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.favorite.upsert({
    where: { userId_listingId: { userId: session.userId, listingId } },
    create: { userId: session.userId, listingId },
    update: {},
  });
  return NextResponse.json({ ok: true, favorited: true });
}

export async function DELETE(req: Request, { params }: RouteContext<"/api/favorites/[listingId]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { listingId } = await params;

  await prisma.favorite.deleteMany({ where: { userId: session.userId, listingId } });
  return NextResponse.json({ ok: true, favorited: false });
}
