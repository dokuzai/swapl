import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, unauthenticated } from "@/lib/api/errors";
import { KEYS_KINDS, type KeysKind } from "@/lib/keys/ledger";

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// GET /api/keys/transactions?kind=&cursor=&limit= (DOK-157)
//
// Paginated, kind-filterable view of the caller's Keys ledger. Each row already
// carries balanceAfter (the running balance at that point — written by the
// ledger), so the client renders a progressive balance with no client-side
// math. Cursor pagination over the immutable, append-only ledger: the cursor is
// the id of the last row from the previous page (stable, no offset drift).
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");

  if (kindParam && !KEYS_KINDS.includes(kindParam as KeysKind)) {
    return invalidInput("Unknown kind", { allowed: KEYS_KINDS });
  }

  let limit = PAGE_SIZE;
  if (limitParam) {
    const n = Number.parseInt(limitParam, 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
      return invalidInput("limit must be between 1 and " + MAX_PAGE_SIZE);
    }
    limit = n;
  }

  const where = {
    userId: session.userId,
    ...(kindParam ? { kind: kindParam } : {}),
  };

  // Fetch one extra row to detect whether a next page exists.
  const rows = await prisma.keysTransaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;

  return NextResponse.json({
    transactions: page.map((t) => ({
      id: t.id,
      delta: t.delta,
      kind: t.kind,
      balanceAfter: t.balanceAfter,
      stayId: t.stayId,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    })),
    nextCursor,
    hasMore,
  });
}
