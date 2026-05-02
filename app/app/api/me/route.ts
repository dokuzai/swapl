// Current user snapshot for mobile clients. Replaces the bag of RSC reads
// that the dashboard, navbar, and account pages do today.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { parseJSON } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [user, listingsCount, incoming, outgoing, active, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.listing.count({ where: { userId: session.userId, isActive: true } }),
    prisma.swapProposal.count({
      where: { targetListing: { userId: session.userId }, status: { in: ["PENDING", "COUNTERED"] } },
    }),
    prisma.swapProposal.count({
      where: { proposerId: session.userId, status: { in: ["PENDING", "COUNTERED"] } },
    }),
    prisma.swapAgreement.count({
      where: {
        OR: [{ listing1: { userId: session.userId } }, { listing2: { userId: session.userId } }],
        status: "ACTIVE",
      },
    }),
    prisma.subscription.findUnique({ where: { userId: session.userId } }),
  ]);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      bioVibe: user.bioVibe,
      verified: user.verified,
      role: user.role,
      interests: parseJSON<string[]>(user.interests, []),
      createdAt: user.createdAt.toISOString(),
    },
    counts: {
      listings: listingsCount,
      incomingProposals: incoming,
      outgoingProposals: outgoing,
      activeSwaps: active,
    },
    subscription: subscription
      ? {
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
  });
}
