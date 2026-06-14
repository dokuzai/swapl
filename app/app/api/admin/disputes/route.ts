// GET /api/admin/disputes — the admin dispute queue, optionally filtered by
// status and/or category. Web session + swapl_admin gate. Internal surface
// (the /admin page renders from prisma directly; this JSON endpoint backs any
// programmatic admin tooling and keeps the contract explicit).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/auth/abilities";
import {
  DISPUTE_STATUSES,
  DISPUTE_CATEGORIES,
  isUrgentCategory,
  parsePhotos,
} from "@/lib/disputes";

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: msg === "UNAUTHENTICATED" ? 401 : 403 },
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");

  const disputes = await prisma.swapDispute.findMany({
    where: {
      ...(status && (DISPUTE_STATUSES as readonly string[]).includes(status) ? { status } : {}),
      ...(category && (DISPUTE_CATEGORIES as readonly string[]).includes(category)
        ? { category }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      openedBy: { select: { id: true, name: true, email: true } },
      resolvedBy: { select: { id: true, name: true, email: true } },
      agreement: { select: { id: true, proposalId: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    disputes: disputes.map((d) => ({
      id: d.id,
      agreementId: d.agreementId,
      proposalId: d.agreement.proposalId,
      category: d.category,
      urgent: isUrgentCategory(d.category),
      status: d.status,
      description: d.description,
      photos: parsePhotos(d.photos),
      resolution: d.resolution,
      openedBy: { id: d.openedBy.id, name: d.openedBy.name, email: d.openedBy.email },
      resolvedBy: d.resolvedBy
        ? { id: d.resolvedBy.id, name: d.resolvedBy.name, email: d.resolvedBy.email }
        : null,
      messageCount: d._count.messages,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}
