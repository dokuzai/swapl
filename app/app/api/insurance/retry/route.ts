// Re-issue a policy that was left in "pending" because the underwriter call
// failed when the swap was accepted. The accept flow deliberately persists a
// pending policy so the user isn't blocked; this endpoint is how that pending
// state gets healed. Either swap party may trigger it.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { insuranceProvider } from "@/lib/insurance";
import { policyView, userIsParty } from "@/lib/insurance/access";
import { anchorIssuedPolicy } from "@/lib/insurance/anchor";

export const runtime = "nodejs";

type ListingWithUser = {
  id: string;
  city: string;
  neighbourhood: string;
  country: string;
  address: string | null;
  sizeSqm: number;
  user: { id: string; name: string | null; email: string };
};

function partyOf(listing: ListingWithUser) {
  return {
    userId: listing.user.id,
    fullName: listing.user.name ?? listing.user.email,
    email: listing.user.email,
    listing: {
      id: listing.id,
      city: listing.city,
      neighbourhood: listing.neighbourhood,
      country: listing.country,
      address: listing.address,
      sizeSqm: listing.sizeSqm,
    },
  };
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const agreementId = body && typeof body.agreementId === "string" ? body.agreementId : null;
  if (!agreementId) return NextResponse.json({ error: "agreementId is required" }, { status: 400 });

  const agreement = await prisma.swapAgreement.findUnique({
    where: { id: agreementId },
    include: {
      listing1: { include: { user: true } },
      listing2: { include: { user: true } },
      insurancePolicy: true,
    },
  });
  if (!agreement || !agreement.insurancePolicy) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userIsParty(agreement, session.userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (agreement.insurancePolicy.status !== "pending") {
    return NextResponse.json(
      { error: "Policy is not pending; nothing to retry.", status: agreement.insurancePolicy.status },
      { status: 409 },
    );
  }

  const provider = insuranceProvider();
  let result: Awaited<ReturnType<typeof provider.createPolicy>>;
  try {
    result = await provider.createPolicy({
      agreementId: agreement.id,
      parties: [partyOf(agreement.listing1), partyOf(agreement.listing2)],
      dateFrom: agreement.dateFrom,
      dateTo: agreement.dateTo,
    });
  } catch (err) {
    console.error("[insurance:retry]", err);
    return NextResponse.json({ error: "Underwriter unavailable; please try again later." }, { status: 502 });
  }

  const updated = await prisma.insurancePolicy.update({
    where: { agreementId: agreement.id },
    data: {
      provider: provider.name,
      policyNumber: result.policyNumber,
      coverageAmount: result.coverageAmount,
      status: "active",
      premiumCents: result.premiumCents,
      platformShareCents: result.platformShareCents,
      externalId: result.externalId,
      documentsUrl: result.documentsUrl,
      expiresAt: result.expiresAt,
    },
  });

  // DOK-156 — best-effort proof-of-cover anchor for the now-active policy.
  void anchorIssuedPolicy(updated.id);

  return NextResponse.json({ ok: true, policy: policyView(updated, agreement) });
}
