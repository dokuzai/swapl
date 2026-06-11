// Public host profile: name, bio, verification status, interests, and their
// active listings. Mirrors /profile/[id] page.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/db";
import { toDTO } from "@/lib/listing-utils";

export async function GET(_req: Request, { params }: RouteContext<"/api/profiles/[id]">) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatar: true,
      bio: true,
      bioVibe: true,
      verified: true,
      interests: true,
      createdAt: true,
      suspendedAt: true,
    },
  });
  // Moderation: suspended hosts are hidden — indistinguishable from missing.
  if (!user || user.suspendedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const listings = await prisma.listing.findMany({
    where: { userId: id, isActive: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      bioVibe: user.bioVibe,
      verified: user.verified,
      memberSince: user.createdAt.toISOString(),
      interests: parseJSON<string[]>(user.interests, []),
    },
    listings: listings.map((l) => toDTO(l)),
  });
}
