// Pay-on-accept for "Get Inspired" packages (DOK-148).
//
// Money rules (non-negotiable):
//   - NOTHING is charged before the host accepts. Checkout only saves a card
//     via a SetupIntent (usage: off_session) — no capture-manual auth that
//     could expire.
//   - Payable items are ONLY the package's selected concierge add-ons with
//     priceCents > 0. External affiliate items stay links — we never charge
//     for them.
//   - On accept: one off-session PaymentIntent (confirm: true) for the total.
//     A failed charge NEVER reverts the acceptance — we flag it, notify the
//     member, and recover the payment later.
//   - Everything degrades without Stripe: no env key → no payment step.
//
// NOTE: this module must stay importable from route modules that are unit
// tested without a React server context, so the Stripe SDK (and its
// "server-only" guard) is loaded lazily and only when STRIPE_SECRET_KEY is
// actually configured.

import { prisma, parseJSON } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { payableSummary, type InspirePayload } from "@/lib/ai/inspire";

export const INSPIRE_PI_KIND = "inspire_package";

function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeClient() {
  const { getStripe } = await import("./stripe");
  return getStripe();
}

/**
 * Best effort: at confirm time, if the webhook hasn't stamped the saved card
 * yet, recover it straight from the SetupIntent. Returns the fields to merge
 * into the package update (empty object when there's nothing to recover).
 */
export async function recoverSavedPaymentMethod(pkg: {
  setupIntentId: string | null;
  paymentStatus: string;
}): Promise<{ paymentMethodId?: string; paymentStatus?: string }> {
  if (!pkg.setupIntentId || pkg.paymentStatus !== "none" || !stripeConfigured()) return {};
  try {
    const stripe = await stripeClient();
    const si = await stripe.setupIntents.retrieve(pkg.setupIntentId);
    if (si.status === "succeeded" && si.payment_method) {
      const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;
      return { paymentMethodId: pm, paymentStatus: "saved" };
    }
  } catch (err) {
    console.error("[inspire:recover-payment-method]", err);
  }
  return {};
}

/**
 * Accept hook: when a proposal flips to ACCEPTED, charge the confirmed
 * inspiration package linked to it (if any) for its selected payable add-ons.
 * Failure is logged loudly + the member is notified, but the acceptance
 * stands — payment is recovered out-of-band.
 */
export async function chargeInspirePackageOnAccept(proposalId: string): Promise<void> {
  const pkg = await prisma.inspirationPackage.findFirst({
    where: { proposalId, status: "confirmed", paymentStatus: "saved" },
  });
  if (!pkg) return;

  const payload = parseJSON<Pick<InspirePayload, "addOns"> | null>(pkg.payload, null);
  if (!payload) return;
  const { payableItems, totalCents, currency } = payableSummary(payload);
  if (totalCents <= 0) return;

  if (!stripeConfigured() || !pkg.paymentMethodId) {
    console.error(
      `[inspire:pay-on-accept] cannot charge package ${pkg.id} (stripe=${stripeConfigured()}, pm=${Boolean(pkg.paymentMethodId)})`
    );
    return;
  }

  const customer = await prisma.stripeCustomer.findUnique({ where: { userId: pkg.userId } });
  if (!customer) {
    console.error(`[inspire:pay-on-accept] no StripeCustomer for user ${pkg.userId}, package ${pkg.id}`);
    return;
  }

  try {
    const stripe = await stripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      customer: customer.stripeId,
      payment_method: pkg.paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        kind: INSPIRE_PI_KIND,
        packageId: pkg.id,
        userId: pkg.userId,
        addOnSlugs: payableItems.map((a) => a.slug).join(","),
      },
    });
    // The webhook (payment_intent.succeeded → reconcile) creates the
    // OrderAddOn rows; here we just mirror the package state for instant UX.
    await prisma.inspirationPackage.update({
      where: { id: pkg.id },
      data: { paymentStatus: "charged" },
    });
    console.log(`[inspire:pay-on-accept] charged ${totalCents} ${currency} for package ${pkg.id} (${intent.id})`);
  } catch (err) {
    // LOUD: the swap is accepted, the money is not in. Ops recovers via the
    // saved card; the member is told no action is needed on the swap itself.
    console.error(`[inspire:pay-on-accept] CHARGE FAILED for package ${pkg.id} — proposal stays accepted`, err);
    await prisma.inspirationPackage.update({
      where: { id: pkg.id },
      data: { paymentStatus: "failed" },
    });
    const user = await prisma.user.findUnique({ where: { id: pkg.userId }, select: { email: true } });
    if (user?.email) {
      sendEmail({
        to: user.email,
        subject: "Your swap is confirmed — but the extras payment didn't go through",
        text:
          "Good news first: your swap is accepted and nothing changes there.\n\n" +
          "We couldn't charge your saved card for the extras in your Get Inspired package. " +
          "We'll retry, or you can update your payment method from your account. " +
          "You'll only ever be charged for the extras you selected.",
      }).catch((e) => console.error("[inspire:pay-on-accept:email]", e));
    }
    sendPush(pkg.userId, {
      title: "Extras payment failed",
      body: "Your swap is still accepted — we just couldn't charge your card for the extras.",
      data: { kind: "addOnPurchased", proposalId, deepLink: `swapl://swaps/${proposalId}` },
    }).catch((e) => console.error("[inspire:pay-on-accept:push]", e));
  }
}

/**
 * Decline/withdraw hook: nothing was ever charged (SetupIntent only), so we
 * just mark the package's payment as canceled.
 */
export async function cancelInspirePackagePayment(proposalId: string): Promise<void> {
  await prisma.inspirationPackage.updateMany({
    where: { proposalId, paymentStatus: { in: ["none", "saved"] } },
    data: { paymentStatus: "canceled" },
  });
}
