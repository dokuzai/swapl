import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import { nightlyKeysFor } from "@/lib/keys/value";

// GET /api/keys — the caller's Keys wallet: cached balance (source of truth is
// the ledger), the nightly-Keys value of each of their listings, and their
// most recent ledger transactions.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const [user, listings, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { keysBalance: true },
    }),
    prisma.listing.findMany({
      where: { userId: session.userId },
      select: { id: true, title: true, sizeSqm: true, sleeps: true, city: true, isVerified: true },
    }),
    prisma.keysTransaction.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    balance: user?.keysBalance ?? 0,
    nightlyKeysForMyListings: listings.map((l) => ({
      listingId: l.id,
      title: l.title,
      nightlyKeys: nightlyKeysFor({
        sizeSqm: l.sizeSqm,
        sleeps: l.sleeps,
        city: l.city,
        isVerified: l.isVerified,
      }),
    })),
    recentTransactions: transactions.map((t) => ({
      id: t.id,
      delta: t.delta,
      kind: t.kind,
      balanceAfter: t.balanceAfter,
      stayId: t.stayId,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
