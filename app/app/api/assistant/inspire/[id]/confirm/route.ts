// POST /api/assistant/inspire/{id}/confirm — turn a draft package into a REAL
// swap proposal. The body may edit the pick (one of the package's listings),
// the dates, and the message.
//
// The proposal is created by invoking the actual POST /api/proposals handler
// with the caller's own credentials — NOT by re-implementing its rules — so
// suspension checks, plan limits (402 upsell), rate limits and notifications
// all apply exactly as if the user had proposed by hand.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { POST as createProposal } from "@/app/api/proposals/route";
import { invalidInput, notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import type { InspirePackage } from "@/lib/ai/inspire";

const schema = z.object({
  listingId: z.string().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  message: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: RouteContext<"/api/assistant/inspire/[id]/confirm">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const pkg = await prisma.inspirationPackage.findUnique({ where: { id } });
  if (!pkg || pkg.userId !== session.userId) return notFound("Package not found");
  if (pkg.status !== "draft") {
    return unprocessable("PACKAGE_NOT_DRAFT", { message: `This package is already ${pkg.status}.` });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  let payload: Omit<InspirePackage, "packageId">;
  try {
    payload = JSON.parse(pkg.payload);
  } catch {
    return unprocessable("PACKAGE_CORRUPT");
  }

  // Edits may only re-target a listing that was actually in the package —
  // the destination or one of the real alternatives.
  const allowed = new Set([payload.destination.listingId, ...payload.alternatives.map((a) => a.listingId)]);
  const targetListingId = parsed.data.listingId ?? payload.destination.listingId;
  if (!allowed.has(targetListingId)) {
    return invalidInput("listingId must be the package destination or one of its alternatives.");
  }

  const dateFrom = parsed.data.dateFrom ?? payload.dates.from;
  const dateTo = parsed.data.dateTo ?? payload.dates.to;
  if (dateTo <= dateFrom) return invalidInput("End date must be after start.");
  const message = parsed.data.message ?? payload.proposalMessage;

  // Same code path as a hand-written proposal: forward the caller's own
  // headers (cookie/bearer) into the real handler.
  const res = await createProposal(
    new Request(new URL("/api/proposals", req.url), {
      method: "POST",
      headers: new Headers(req.headers),
      body: JSON.stringify({
        proposerListingId: payload.myListingId,
        targetListingId,
        dateFrom,
        dateTo,
        message,
      }),
    })
  );

  // Any refusal (suspended, plan limit 402, validation…) propagates verbatim.
  if (!res.ok) return res;

  const { id: proposalId } = (await res.json()) as { id: string };
  await prisma.inspirationPackage.update({
    where: { id: pkg.id },
    data: { status: "confirmed", proposalId },
  });

  return NextResponse.json({ ok: true, proposalId, packageId: pkg.id });
}
