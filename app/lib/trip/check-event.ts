// Shared check-in / check-out handler (DOK-152). Both routes are identical
// except the event type, so the logic lives here: party-only, idempotent per
// (type, user), creates a SwapCheckEvent, and best-effort notifies the other
// party. The check-in event makes the derived phase IN_PROGRESS (see
// lib/trip/phase.ts) — no status write is needed.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { forbidden, notFound, invalidInput, unauthenticated, apiError } from "@/lib/api/errors";

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(12).optional(),
});

export async function handleCheckEvent(
  req: Request,
  id: string,
  type: "checkin" | "checkout",
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // Blando rate limit: 10 check events / 5 min per user (covers retries +
  // photo re-submits without being a real cap in normal use).
  const rl = checkRateLimit(`check-event:${session.userId}`, 10, 5 * 60 * 1000);
  if (!rl.ok) return apiError(429, "Rate limited");

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const agreement = await prisma.swapAgreement.findUnique({
    where: { id },
    include: {
      listing1: { include: { user: { select: { id: true, name: true, email: true } } } },
      listing2: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!agreement) return notFound();

  const onSide1 = agreement.listing1.userId === session.userId;
  const onSide2 = agreement.listing2.userId === session.userId;
  if (!onSide1 && !onSide2) return forbidden();

  // A cancelled swap can't accept check events.
  if (agreement.status === "INTERRUPTED") {
    return apiError(409, "Swap is no longer active");
  }

  // Idempotent per (type, user): a second check-in by the same party returns
  // the existing event instead of creating a duplicate (and re-notifying).
  const existing = await prisma.swapCheckEvent.findFirst({
    where: { agreementId: id, userId: session.userId, type },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      event: {
        id: existing.id,
        type: existing.type,
        note: existing.note,
        photos: JSON.parse(existing.photos || "[]") as string[],
        createdAt: existing.createdAt.toISOString(),
      },
      duplicate: true,
    });
  }

  const event = await prisma.swapCheckEvent.create({
    data: {
      agreementId: id,
      userId: session.userId,
      type,
      note: parsed.data.note ?? null,
      photos: JSON.stringify(parsed.data.photos ?? []),
    },
  });

  // Notify the OTHER party — best effort.
  const me = onSide1 ? agreement.listing1.user : agreement.listing2.user;
  const other = onSide1 ? agreement.listing2.user : agreement.listing1.user;
  const myName = me.name ?? "Your swap partner";
  const tmpl = type === "checkin" ? emailTemplates.checkedIn : emailTemplates.checkedOut;
  const pushTmpl = type === "checkin" ? pushTemplates.checkedIn : pushTemplates.checkedOut;
  if (other.email) {
    sendEmail(tmpl(other.email, myName)).catch((err) => console.error("[check-event:email]", err));
  }
  sendPush(other.id, pushTmpl(agreement.proposalId, myName)).catch((err) =>
    console.error("[check-event:push]", err),
  );

  return NextResponse.json({
    ok: true,
    event: {
      id: event.id,
      type: event.type,
      note: event.note,
      photos: JSON.parse(event.photos || "[]") as string[],
      createdAt: event.createdAt.toISOString(),
    },
  });
}
