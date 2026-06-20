// DELETE /api/account — user-initiated account deletion (Apple Guideline
// 5.1.1(v)). Soft-delete + anonymize: we keep the row so counterparties' swap
// and review history stays intact, but scrub every piece of personal data, free
// the email, hide their homes, and tear down all credentials/sessions. Because
// `suspendedAt` is checked on every login path (password, OAuth, passkey, OTP),
// setting it blocks the account from ever being signed into again — no schema
// change required.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getStripe } from "@/lib/billing/stripe";

export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const userId = session.userId;

  // Best-effort: cancel any Stripe subscription so a deleted account is never
  // billed again. Never block deletion on a billing hiccup.
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (sub?.stripeSubscriptionId) {
      await getStripe().subscriptions.cancel(sub.stripeSubscriptionId);
    }
  } catch (err) {
    console.error("[account:delete:stripe]", err);
  }

  await prisma.$transaction(async (tx) => {
    // Remove the member's homes from browse and kill every credential/session.
    await tx.listing.updateMany({ where: { userId }, data: { isActive: false } });
    await tx.authToken.deleteMany({ where: { userId } });
    await tx.device.deleteMany({ where: { userId } });
    await tx.oAuthAccount.deleteMany({ where: { userId } });
    await tx.webAuthnCredential.deleteMany({ where: { userId } });

    // Anonymise all PII. The unique email is reassigned to a per-id sentinel so
    // the original address is freed and the row no longer carries personal data.
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.swapl.invalid`,
        phone: null,
        name: null,
        avatar: null,
        bio: null,
        bioVibe: null,
        work: null,
        languages: null,
        homeCity: null,
        homeCountry: null,
        contactChannels: null,
        interests: "[]",
        passwordHash: null,
        aiApiKey: null,
        referralCode: null,
        suspendedAt: new Date(),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
