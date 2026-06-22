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
import { recordProposalEvent } from "@/lib/conversations";

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(12).optional(),
  // Optional before/after condition video (audio narration baked in).
  videoUrl: z.string().url().optional(),
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

  // Idempotent per (type, user): a second check-in by the same party never
  // creates a duplicate or re-notifies. It DOES enrich the same event, so a host
  // can come back and attach a video they recorded after checking in, add more
  // photos, or update the note.
  const existing = await prisma.swapCheckEvent.findFirst({
    where: { agreementId: id, userId: session.userId, type },
  });
  if (existing) {
    const mergedPhotos = Array.from(
      new Set([
        ...(JSON.parse(existing.photos || "[]") as string[]),
        ...(parsed.data.photos ?? []),
      ]),
    );
    const updated = await prisma.swapCheckEvent.update({
      where: { id: existing.id },
      data: {
        photos: JSON.stringify(mergedPhotos),
        videoUrl: parsed.data.videoUrl ?? existing.videoUrl,
        note: parsed.data.note ?? existing.note,
      },
    });
    return NextResponse.json({
      ok: true,
      event: {
        id: updated.id,
        type: updated.type,
        note: updated.note,
        photos: JSON.parse(updated.photos || "[]") as string[],
        videoUrl: updated.videoUrl,
        createdAt: updated.createdAt.toISOString(),
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
      videoUrl: parsed.data.videoUrl ?? null,
    },
  });

  // Notify the OTHER party — best effort.
  const me = onSide1 ? agreement.listing1.user : agreement.listing2.user;
  const other = onSide1 ? agreement.listing2.user : agreement.listing1.user;
  const myName = me.name ?? "Your swap partner";

  // DOK-221: record it on the swap's timeline.
  recordProposalEvent(agreement.proposalId, type === "checkin" ? "checked_in" : "checked_out", {
    by: myName,
  }).catch(() => {});
  const tmpl = type === "checkin" ? emailTemplates.checkedIn : emailTemplates.checkedOut;
  const pushTmpl = type === "checkin" ? pushTemplates.checkedIn : pushTemplates.checkedOut;
  if (other.email) {
    sendEmail(tmpl(other.email, myName), { kind: type === "checkin" ? "checkedIn" : "checkedOut" }).catch(
      (err) => console.error("[check-event:email]", err),
    );
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
      videoUrl: event.videoUrl,
      createdAt: event.createdAt.toISOString(),
    },
  });
}
