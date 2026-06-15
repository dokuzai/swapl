import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import { nightlyKeysFor } from "@/lib/keys/value";
import { keysKindLabel } from "@/lib/keys/ledger";
import { earnWaysFor } from "@/lib/keys/earn-ways";

// GET /api/keys — the caller's Keys wallet: cached balance (source of truth is
// the ledger), the nightly-Keys value of each of their listings, their most
// recent ledger transactions (each carrying a human label for its kind — incl.
// the DOK-164 earn_* kinds), and the "ways to earn Keys" catalogue with the
// user's done/to-do state.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const [user, listings, transactions, earnWays] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { keysBalance: true },
    }),
    prisma.listing.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        title: true,
        sizeSqm: true,
        sleeps: true,
        city: true,
        isVerified: true,
        spaceType: true,
        roomsOffered: true,
        nightlyKeysBase: true,
        nightlyKeysAdjustment: true,
      },
    }),
    prisma.keysTransaction.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    earnWaysFor(session.userId),
  ]);

  return NextResponse.json({
    balance: user?.keysBalance ?? 0,
    nightlyKeysForMyListings: listings.map((l) => ({
      listingId: l.id,
      title: l.title,
      nightlyKeys: nightlyKeysFor(l),
    })),
    recentTransactions: transactions.map((t) => ({
      id: t.id,
      delta: t.delta,
      kind: t.kind,
      label: keysKindLabel(t.kind),
      balanceAfter: t.balanceAfter,
      stayId: t.stayId,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    })),
    earnWays,
  });
}
