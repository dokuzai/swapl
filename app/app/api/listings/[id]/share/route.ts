// GET /api/listings/{id}/share — mint (or reuse) the caller's share link for a
// listing (DOK-164). The returned URL carries ?s=TOKEN; when a NEW guest books
// or swaps the listing via that link, the sharer earns a one-time
// `earn_share_converted` bonus (identity-gated, idempotent, capped).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { notFound, unauthenticated } from "@/lib/api/errors";
import { ensureShareToken } from "@/lib/keys/earn";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: Request, { params }: RouteContext<"/api/listings/[id]/share">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!listing || !listing.isActive) return notFound();

  const token = await ensureShareToken(id, session.userId);
  const shareUrl = `${APP_URL}/listings/${encodeURIComponent(id)}?s=${encodeURIComponent(token)}`;

  return NextResponse.json({ token, shareUrl });
}
