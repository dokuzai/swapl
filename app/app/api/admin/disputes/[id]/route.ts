// POST /api/admin/disputes/{id} — admin drives the dispute state machine:
// change status, (re)assign the resolver, and record a resolution note. On a
// status change both parties are notified (email + push, best effort).
//
// Web session + swapl_admin role gate via requireAdminFromRequest. This route
// is part of the internal /api/admin/* surface (not the public client spec).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/auth/abilities";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { DISPUTE_STATUSES } from "@/lib/disputes";

const schema = z.object({
  status: z.enum(DISPUTE_STATUSES).optional(),
  resolution: z.string().trim().max(4000).optional(),
  // "me" assigns the acting admin as resolver; "" / null clears it.
  assignToMe: z.boolean().optional(),
});

export async function POST(req: Request, { params }: RouteContext<"/api/admin/disputes/[id]">) {
  let me;
  try {
    me = await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: msg === "UNAUTHENTICATED" ? 401 : 403 },
    );
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (
    parsed.data.status === undefined &&
    parsed.data.resolution === undefined &&
    parsed.data.assignToMe === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const dispute = await prisma.swapDispute.findUnique({
    where: { id },
    include: {
      agreement: {
        select: {
          proposalId: true,
          listing1: { select: { user: { select: { id: true, email: true } } } },
          listing2: { select: { user: { select: { id: true, email: true } } } },
        },
      },
    },
  });
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const statusChanged =
    parsed.data.status !== undefined && parsed.data.status !== dispute.status;

  const data: {
    status?: string;
    resolution?: string | null;
    resolvedById?: string | null;
  } = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.resolution !== undefined) data.resolution = parsed.data.resolution || null;
  if (parsed.data.assignToMe !== undefined) data.resolvedById = parsed.data.assignToMe ? me.id : null;

  const updated = await prisma.swapDispute.update({ where: { id }, data });

  if (statusChanged) {
    const parties = [
      dispute.agreement.listing1.user,
      dispute.agreement.listing2.user,
    ];
    const proposalId = dispute.agreement.proposalId;
    for (const p of parties) {
      if (p.email) {
        sendEmail(
          emailTemplates.disputeStatusChanged(
            p.email,
            proposalId,
            updated.status,
            updated.resolution,
          ),
        ).catch((err) => console.error("[dispute-admin:email]", err));
      }
      sendPush(p.id, pushTemplates.disputeStatusChanged(proposalId, updated.status)).catch((err) =>
        console.error("[dispute-admin:push]", err),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    dispute: {
      id: updated.id,
      status: updated.status,
      resolution: updated.resolution,
      resolvedById: updated.resolvedById,
    },
  });
}
