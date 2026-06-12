// GET /api/assistant/inspire/{id} — fetch one package (owner only) with its
// current paymentStatus. Mobile clients poll this when they come back from
// the Safari/Custom-Tab payment sheet so they can show "card saved" (stamped
// by the setup_intent.succeeded webhook) before calling /confirm.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import { payableSummary, type InspirePayload } from "@/lib/ai/inspire";

export async function GET(req: Request, { params }: RouteContext<"/api/assistant/inspire/[id]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const pkg = await prisma.inspirationPackage.findUnique({ where: { id } });
  if (!pkg || pkg.userId !== session.userId) return notFound("Package not found");

  let payload: InspirePayload;
  try {
    payload = JSON.parse(pkg.payload);
  } catch {
    return unprocessable("PACKAGE_CORRUPT");
  }

  const { totalCents, currency } = payableSummary(payload);
  return NextResponse.json({
    id: pkg.id,
    status: pkg.status,
    paymentStatus: pkg.paymentStatus,
    proposalId: pkg.proposalId,
    payable: { totalCents, currency },
    // Stored payload has no packageId (stamped at compose time) — re-stamp so
    // `package` is the exact InspirePackage shape clients already parse.
    package: { ...payload, packageId: pkg.id },
  });
}
