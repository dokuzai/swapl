// POST /api/agreements/{id}/dispute — a party opens a dispute (resolution
//   center) on their swap. Photos must already be uploaded via
//   /api/uploads/listing-photo. Notifies the other party + the admin inbox.
// GET  /api/agreements/{id}/dispute — the party-facing case: status + full
//   message timeline. Either party (or, implicitly, no one else) can read it.
//
// Gating is server-side: only the two parties of the agreement. Categories
// safety|access are marked `urgent` so clients foreground the 24/7 line.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { forbidden, notFound, invalidInput, unauthenticated, apiError } from "@/lib/api/errors";
import {
  DISPUTE_CATEGORIES,
  isUrgentCategory,
  parsePhotos,
  disputeAdminRecipients,
} from "@/lib/disputes";

const createSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES),
  description: z.string().trim().min(1).max(4000),
  photos: z.array(z.string().url()).max(12).optional(),
});

async function loadAgreement(id: string) {
  return prisma.swapAgreement.findUnique({
    where: { id },
    include: {
      listing1: { include: { user: { select: { id: true, name: true, email: true } } } },
      listing2: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
}

export async function POST(req: Request, { params }: RouteContext<"/api/agreements/[id]/dispute">) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // Opening a dispute is rare and heavy — 5 / 10 min per user covers retries
  // and photo re-submits without letting one user flood the queue.
  const rl = checkRateLimit(`dispute-open:${session.userId}`, 5, 10 * 60 * 1000);
  if (!rl.ok) return apiError(429, "Rate limited");

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const agreement = await loadAgreement(id);
  if (!agreement) return notFound();

  const onSide1 = agreement.listing1.userId === session.userId;
  const onSide2 = agreement.listing2.userId === session.userId;
  if (!onSide1 && !onSide2) return forbidden();

  const dispute = await prisma.swapDispute.create({
    data: {
      agreementId: id,
      openedById: session.userId,
      category: parsed.data.category,
      description: parsed.data.description,
      photos: JSON.stringify(parsed.data.photos ?? []),
    },
  });

  const urgent = isUrgentCategory(dispute.category);
  const other = onSide1 ? agreement.listing2.user : agreement.listing1.user;

  // Notify the OTHER party — best effort.
  if (other.email) {
    sendEmail(
      emailTemplates.disputeOpened(other.email, agreement.proposalId, dispute.category, urgent),
    ).catch((err) => console.error("[dispute:email:other]", err));
  }
  sendPush(other.id, pushTemplates.disputeOpened(agreement.proposalId, dispute.category, urgent)).catch(
    (err) => console.error("[dispute:push:other]", err),
  );

  // Notify the admin / support inbox — best effort.
  disputeAdminRecipients()
    .then((recipients) => {
      for (const to of recipients) {
        sendEmail(
          emailTemplates.disputeOpenedAdmin(to, dispute.id, dispute.category, urgent),
        ).catch((err) => console.error("[dispute:email:admin]", err));
      }
    })
    .catch((err) => console.error("[dispute:admin-recipients]", err));

  return NextResponse.json({
    ok: true,
    dispute: {
      id: dispute.id,
      category: dispute.category,
      urgent,
      status: dispute.status,
      description: dispute.description,
      photos: parsePhotos(dispute.photos),
      createdAt: dispute.createdAt.toISOString(),
    },
  });
}

export async function GET(req: Request, { params }: RouteContext<"/api/agreements/[id]/dispute">) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const agreement = await loadAgreement(id);
  if (!agreement) return notFound();

  const onSide1 = agreement.listing1.userId === session.userId;
  const onSide2 = agreement.listing2.userId === session.userId;
  if (!onSide1 && !onSide2) return forbidden();

  const disputes = await prisma.swapDispute.findMany({
    where: { agreementId: id },
    orderBy: { createdAt: "desc" },
    include: {
      openedBy: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    disputes: disputes.map((d) => ({
      id: d.id,
      category: d.category,
      urgent: isUrgentCategory(d.category),
      status: d.status,
      description: d.description,
      photos: parsePhotos(d.photos),
      resolution: d.resolution,
      openedBy: { id: d.openedBy.id, name: d.openedBy.name },
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      messages: d.messages.map((m) => ({
        id: m.id,
        authorId: m.authorId,
        authorName: m.author.name,
        body: m.body,
        photos: parsePhotos(m.photos),
        createdAt: m.createdAt.toISOString(),
      })),
    })),
  });
}
