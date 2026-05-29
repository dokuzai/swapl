// Read the authenticated user's insurance policies. Pass ?agreementId=<id> to
// fetch the single policy for one swap (the swap-detail "you're covered" panel);
// omit it to list every policy across the user's swaps (the account page).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { policyView } from "@/lib/insurance/access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const agreementId = new URL(req.url).searchParams.get("agreementId");

  // Scoping the query to the caller's own agreements is the authorization
  // boundary — a policy is only visible to the two swap parties.
  const policies = await prisma.insurancePolicy.findMany({
    where: {
      agreement: {
        OR: [{ listing1: { userId: session.userId } }, { listing2: { userId: session.userId } }],
        ...(agreementId ? { id: agreementId } : {}),
      },
    },
    include: { agreement: { include: { listing1: true, listing2: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (agreementId) {
    const policy = policies[0];
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ policy: policyView(policy, policy.agreement) });
  }

  return NextResponse.json({ policies: policies.map((p) => policyView(p, p.agreement)) });
}
