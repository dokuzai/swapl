// DOK-156 — proof-of-cover verification. Recomputes the certificate hash from
// the persisted (PII-free) metadata and reports whether the policy is anchored
// on-chain, plus the explorer link. Only the two swap parties can read it.
//
// This is a read-only confirmation endpoint: it never mutates and never touches
// the chain to write. The on-chain record itself remains the tamper-proof
// source of truth; here we expose the locally recomputed hash so a client can
// compare it against what the explorer shows.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { userIsParty, tonExplorerUrl } from "@/lib/insurance/access";
import { certificateHash } from "@/lib/chain/ton";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: RouteContext<"/api/insurance/verify/[policyNumber]">) {
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

  // Recompute the deterministic, PII-free certificate hash from the metadata.
  const expectedHash = certificateHash({
    policyNumber: policy.policyNumber,
    agreementId: policy.agreementId,
    coverageAmount: policy.coverageAmount,
    dateFrom: policy.agreement.dateFrom,
    dateTo: policy.agreement.dateTo,
  });

  return NextResponse.json({
    policyNumber: policy.policyNumber,
    certificateHash: expectedHash,
    anchored: policy.onChainStatus === "anchored" && Boolean(policy.onChainRef),
    onChainRef: policy.onChainRef ?? null,
    onChainNetwork: policy.onChainNetwork ?? null,
    onChainStatus: policy.onChainStatus ?? null,
    anchoredAt: policy.anchoredAt ? policy.anchoredAt.toISOString() : null,
    explorerUrl: tonExplorerUrl(policy.onChainRef, policy.onChainNetwork),
  });
}
