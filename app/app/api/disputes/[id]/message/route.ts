// POST /api/disputes/{id}/message — botta-risposta on a dispute. A party of the
// underlying agreement OR a swapl_admin may post. Photos must already be
// uploaded via /api/uploads/listing-photo.
//
// Status nudges (only out of non-terminal states):
//   - admin replies  -> awaiting_response (the ball is in the members' court)
//   - party replies   -> investigating     (back to the admin)
// resolved|closed disputes reject new messages (409).
//
// Best-effort notifies the *other* participants: a party's message pings the
// other party + admin inbox; an admin's message pings both parties.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { forbidden, notFound, invalidInput, unauthenticated, apiError, rateLimited } from "@/lib/api/errors";
import { isTerminal, parsePhotos, disputeAdminRecipients } from "@/lib/disputes";

const schema = z.object({
  body: z.string().trim().min(1).max(4000),
  photos: z.array(z.string().url()).max(12).optional(),
});

export async function POST(req: Request, { params }: RouteContext<"/api/disputes/[id]/message">) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const rl = checkRateLimit(`dispute-message:${session.userId}`, 30, 5 * 60 * 1000);
  if (!rl.ok)
    return rateLimited("You're sending replies very quickly. Please wait a moment, then try again.");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const dispute = await prisma.swapDispute.findUnique({
    where: { id },
    include: {
      agreement: {
        include: {
          listing1: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
          listing2: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
  });
  if (!dispute) return notFound();

  const me = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, role: true },
  });
  if (!me) return unauthenticated();

  const party1 = dispute.agreement.listing1.user;
  const party2 = dispute.agreement.listing2.user;
  const isParty = party1.id === me.id || party2.id === me.id;
  const isAdmin = me.role === "swapl_admin";
  if (!isParty && !isAdmin) return forbidden();

  if (isTerminal(dispute.status)) {
    return apiError(409, "Dispute is closed");
  }

  const message = await prisma.disputeMessage.create({
    data: {
      disputeId: id,
      authorId: me.id,
      body: parsed.data.body,
      photos: JSON.stringify(parsed.data.photos ?? []),
    },
  });

  // Nudge the status. An admin reply parks it on the members; a party reply
  // hands it back to the admin. open transitions the same way on first reply.
  const nextStatus = isAdmin ? "awaiting_response" : "investigating";
  if (dispute.status !== nextStatus) {
    await prisma.swapDispute.update({ where: { id }, data: { status: nextStatus } });
  }

  const proposalId = dispute.agreement.proposalId;
  const fromName = me.name ?? (isAdmin ? "swapl support" : "Your swap partner");

  // Fan out the new-message ping to everyone *except* the author.
  const partyTargets = [party1, party2].filter((p) => p.id !== me.id);
  for (const p of partyTargets) {
    if (p.email) {
      sendEmail(emailTemplates.disputeMessage(p.email, proposalId, fromName)).catch((err) =>
        console.error("[dispute-message:email:party]", err),
      );
    }
    sendPush(p.id, pushTemplates.disputeMessage(proposalId, fromName)).catch((err) =>
      console.error("[dispute-message:push:party]", err),
    );
  }
  // A party's message also pings the admin inbox so support sees the reply.
  if (!isAdmin) {
    disputeAdminRecipients()
      .then((recipients) => {
        for (const to of recipients) {
          sendEmail(emailTemplates.disputeMessage(to, proposalId, fromName)).catch((err) =>
            console.error("[dispute-message:email:admin]", err),
          );
        }
      })
      .catch((err) => console.error("[dispute-message:admin-recipients]", err));
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    message: {
      id: message.id,
      authorId: message.authorId,
      authorName: me.name,
      body: message.body,
      photos: parsePhotos(message.photos),
      createdAt: message.createdAt.toISOString(),
    },
  });
}
