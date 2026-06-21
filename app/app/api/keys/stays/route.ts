import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, notFound, rateLimited, unauthenticated, unprocessable } from "@/lib/api/errors";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { createKeysStay, KeysStayError } from "@/lib/keys/stay";
import { KeysLedgerError } from "@/lib/keys/ledger";
import { isCouchsurferMember } from "@/lib/billing/limits";
import { STAY_RATE_LIMIT, STAY_RATE_WINDOW_MS } from "@/lib/keys/config";
import { sendPush, pushTemplates } from "@/lib/push";
import { resolveShareToken } from "@/lib/keys/earn";

const bodySchema = z.object({
  listingId: z.string().min(1),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  // DOK-219: "couchsurf" sends a free request (gated by a Couchsurfer membership)
  // instead of spending Keys. Defaults to a normal Keys stay.
  kind: z.enum(["keys", "couchsurf"]).default("keys"),
  // DOK-164: optional share token (?s=TOKEN) the guest arrived via. When it
  // resolves to a share of THIS listing by another user, we record the pending
  // conversion on the stay so the sharer is credited once the host confirms.
  shareToken: z.string().min(1).max(64).optional(),
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

  // DOK-219: sending a couchsurf hosting request requires a Couchsurfer membership.
  if (parsed.data.kind === "couchsurf" && !(await isCouchsurferMember(session.userId))) {
    return unprocessable("A Couchsurfer membership is required to send couch requests.", {
      code: "COUCHSURFER_MEMBERSHIP_REQUIRED",
    });
  }

  try {
    const stay = await createKeysStay({
      listingId: parsed.data.listingId,
      guestId: session.userId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      kind: parsed.data.kind,
    });
    sendPush(stay.hostId, pushTemplates.keysStayRequested(stay.id, stay.nights, stay.keysCost)).catch(() => {});

    // DOK-164: record the pending share→conversion on the attribution row so the
    // SHARER is credited once the host confirms the stay (award happens at
    // confirm, not on a still-cancellable pending booking). Best-effort; a bad
    // or self token simply records nothing.
    if (parsed.data.shareToken) {
      resolveShareToken(parsed.data.shareToken, parsed.data.listingId)
        .then((att) => {
          if (!att || att.sharerId === session.userId) return;
          return prisma.listingShareAttribution.update({
            where: { id: att.attributionId },
            data: { convertedById: session.userId, conversionRef: stay.id },
          });
        })
        .catch((err) => console.error("[earn:share-pending]", err));
    }

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
