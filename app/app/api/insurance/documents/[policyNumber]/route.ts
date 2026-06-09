// Serves the Certificate of Cover that mock.ts advertises as documentsUrl.
// Until a real underwriter supplies PDFs we render a deterministic plain-text
// certificate from the persisted policy + swap. Only the two parties can read it.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { renderCertificate, userIsParty } from "@/lib/insurance/access";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: RouteContext<"/api/insurance/documents/[policyNumber]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { policyNumber } = await params;

  const policy = await prisma.insurancePolicy.findFirst({
    where: { policyNumber },
    include: { agreement: { include: { listing1: true, listing2: true } } },
  });
  if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userIsParty(policy.agreement, session.userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return new NextResponse(renderCertificate(policy, policy.agreement), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `inline; filename="${policyNumber}.txt"`,
    },
  });
}
