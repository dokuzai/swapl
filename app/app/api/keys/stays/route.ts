import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, notFound, rateLimited, unauthenticated, unprocessable } from "@/lib/api/errors";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { createKeysStay, KeysStayError } from "@/lib/keys/stay";
import { KeysLedgerError } from "@/lib/keys/ledger";
import { STAY_RATE_LIMIT, STAY_RATE_WINDOW_MS } from "@/lib/keys/config";
import { sendPush, pushTemplates } from "@/lib/push";

const bodySchema = z.object({
  listingId: z.string().min(1),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});

// GET /api/keys/stays — the caller's Keys stays, both as guest and as host.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const stays = await prisma.keysStay.findMany({
    where: { OR: [{ guestId: session.userId }, { hostId: session.userId }] },
    include: { listing: { select: { id: true, title: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    stays: stays.map((s) => ({
      id: s.id,
      role: s.guestId === session.userId ? "guest" : "host",
      listing: s.listing,
      dateFrom: s.dateFrom.toISOString(),
      dateTo: s.dateTo.toISOString(),
      nights: s.nights,
      keysCost: s.keysCost,
      status: s.status,
      insurancePolicyId: s.insurancePolicyId,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

// POST /api/keys/stays — request a non-simultaneous Stay-with-Keys. The guest's
// Keys are HELD (not yet spent) and the host is notified to confirm/decline.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return invalidInput("Invalid stay request", { issues: parsed.error.issues });

  const rl = await checkRateLimitDurable(`keys-stay:${session.userId}`, STAY_RATE_LIMIT, STAY_RATE_WINDOW_MS);
  if (!rl.ok) return rateLimited();

  try {
    const stay = await createKeysStay({
      listingId: parsed.data.listingId,
      guestId: session.userId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
    });
    sendPush(stay.hostId, pushTemplates.keysStayRequested(stay.id, stay.nights, stay.keysCost)).catch(() => {});
    return NextResponse.json({
      ok: true,
      stayId: stay.id,
      status: stay.status,
      nights: stay.nights,
      keysCost: stay.keysCost,
    });
  } catch (err) {
    if (err instanceof KeysLedgerError && err.code === "NEGATIVE_BALANCE") {
      return unprocessable("Not enough Keys for this stay");
    }
    if (err instanceof KeysStayError) {
      if (err.code === "LISTING_NOT_FOUND") return notFound("Listing not found");
      return unprocessable(err.message, { code: err.code });
    }
    throw err;
  }
}
