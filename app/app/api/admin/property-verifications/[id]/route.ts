// POST /api/admin/property-verifications/[id] — review an owner-verification
// (DOK-162). Web session + swapl_admin gate. Approving sets the request to
// "approved" and flips Listing.ownerVerified = true (the "Verified owner"
// badge); rejecting sets "rejected" and leaves ownerVerified untouched.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/auth/abilities";
import { grantPropertyVerifiedBonus, maybeGrantListingCompleteBonus } from "@/lib/keys/earn";

const schema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(1000).optional(),
});

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/admin/property-verifications/[id]">
) {
  let me;
  try {
    me = await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: msg === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const row = await prisma.propertyVerification.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Admin override is sovereign (DOK-186): an AI-auto-rejected business listing
  // lands as "rejected", so the admin must be able to reverse it. We therefore
  // allow review on pending OR rejected rows (already-approved is a no-op guard).
  if (row.status === "approved") {
    return NextResponse.json({ error: "Not in review" }, { status: 409 });
  }

  const approve = parsed.data.decision === "approve";
  const status = approve ? "approved" : "rejected";

  const updated = await prisma.propertyVerification.update({
    where: { id },
    data: { status, reviewedById: me.id, note: parsed.data.note ?? null },
  });

  if (approve) {
    // Approving sets the owner badge AND clears any AI business-ineligible flag,
    // restoring the listing to public feeds. The admin's call always wins.
    await prisma.listing.update({
      where: { id: row.listingId },
      data: { ownerVerified: true, ineligibleReason: null, ineligibleAt: null },
    });

    // DOK-164 earning hooks — best-effort, never block the admin action:
    //  - the owner earns the one-time "property verified" bonus, and
    //  - the listing may now meet the "complete" milestone (active + verified +
    //    complete guide), so re-check that too.
    grantPropertyVerifiedBonus({ userId: row.userId, listingId: row.listingId }).catch((err) =>
      console.error("[earn:property-verified]", err)
    );
    maybeGrantListingCompleteBonus(row.listingId).catch((err) =>
      console.error("[earn:listing-complete]", err)
    );
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
