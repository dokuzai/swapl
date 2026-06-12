import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/abilities";
import { sendEmail } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";

const schema = z.object({ action: z.enum(["approve", "reject"]) });

export async function POST(req: Request, { params }: RouteContext<"/api/admin/verifications/[id]">) {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id }, include: { user: true } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.verificationStatus !== "pending") {
    return NextResponse.json({ error: "Not in review" }, { status: 409 });
  }

  if (parsed.data.action === "approve") {
    await prisma.listing.update({
      where: { id },
      data: {
        verificationStatus: "approved",
        verificationReviewedAt: new Date(),
        verificationReviewerId: me.id,
        isVerified: true,
      },
    });
    if (listing.user?.email) {
      sendEmail({
        to: listing.user.email,
        subject: `${listing.title} is now verified on swapl`,
        text: `Your listing ${listing.title} is now verified. The badge is live across browse, detail and your profile.`,
      }).catch((err) => console.error("[verify:approve:email]", err));
    }
    sendPush(listing.userId, pushTemplates.verificationApproved(listing.id, listing.title)).catch(
      (err) => console.error("[verify:approve:push]", err)
    );
    return NextResponse.json({ ok: true });
  }

  // reject
  await prisma.listing.update({
    where: { id },
    data: {
      verificationStatus: "rejected",
      verificationReviewedAt: new Date(),
      verificationReviewerId: me.id,
      isVerified: false,
    },
  });
  // Mark payment refunded so a future Stripe sync hooks know to refund.
  await prisma.listingVerificationPayment.updateMany({
    where: { listingId: id, refunded: false },
    data: { refunded: true },
  });
  if (listing.user?.email) {
    sendEmail({
      to: listing.user.email,
      subject: "Your verification was rejected",
      text: `We weren't able to approve verification for ${listing.title}. The €39 fee has been refunded. You can re-submit anytime from your listing's edit page.`,
    }).catch((err) => console.error("[verify:reject:email]", err));
  }
  sendPush(listing.userId, pushTemplates.verificationRejected(listing.id)).catch((err) =>
    console.error("[verify:reject:push]", err)
  );
  return NextResponse.json({ ok: true });
}
