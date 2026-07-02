"use client";

// "Payment & reservation" step of the Inspire confirm flow (DOK-148).
//
// Shown ONLY when POST …/checkout answered { paymentRequired: true } AND the
// publishable key is configured. The Stripe Payment Element confirms the
// SetupIntent (card saved off-session) — NO charge happens here: the
// off-session PaymentIntent is created only when the host accepts.
//
// This module is loaded lazily (next/dynamic) from inspire-client.tsx so
// @stripe/stripe-js is fetched only when the step is actually shown.

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useLocale, useT } from "@/lib/i18n/client";

export type PayableLine = { id: string; slug: string; name: string; priceCents: number };
export type CheckoutSummary = { payableItems: PayableLine[]; totalCents: number; currency: string };

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
  // Lazy singleton: Stripe.js loads the first time the step renders.
  stripePromise ??= loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  return stripePromise;
}

export function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function PaymentForm({
  onConfirmed,
  onBack,
  submitLabel,
}: {
  onConfirmed: () => void;
  onBack?: () => void;
  submitLabel?: string;
}) {
  const t = useT();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await stripe.confirmSetup({
      elements,
      // Current URL, not a bare /inspire: in return mode (?package&step=pay)
      // a redirect-based payment method must land back on the payment step.
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (err) {
      setError(err.message ?? t("inspire.error.generic"));
      setSubmitting(false);
      return;
    }
    // Card saved (nothing charged) → parent sends the actual proposal.
    onConfirmed();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p className="text-sm" role="alert" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="pill-primary inline-flex items-center gap-2"
        >
          {submitting ? t("inspire.checkout.processing") : (submitLabel ?? t("inspire.checkout.submit"))}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} disabled={submitting} className="pill-ghost">
            {t("inspire.checkout.back")}
          </button>
        )}
      </div>
    </form>
  );
}

export default function PaymentStep({
  clientSecret,
  summary,
  onConfirmed,
  onBack,
  submitLabel,
}: {
  clientSecret: string;
  summary: CheckoutSummary;
  /** Called after the SetupIntent succeeds — the parent then POSTs /confirm
   *  (web flow) or shows "go back to the app" (?step=pay return mode). */
  onConfirmed: () => void;
  /** Omit to hide the back button (return mode has nowhere to go back to). */
  onBack?: () => void;
  /** Overrides "Save card & send proposal" (return mode only saves the card). */
  submitLabel?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const stripe = useMemo(getStripePromise, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker mb-2">{t("inspire.checkout.kicker")}</p>
        <h2 className="font-display text-3xl tracking-[-0.01em] font-medium">
          {t("inspire.checkout.title")}
        </h2>
      </header>

      {/* ---- Order summary: selected payable items only ---- */}
      <section className="surface-card p-6">
        <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-3" style={{ color: "var(--navy-3)" }}>
          {t("inspire.checkout.summaryTitle")}
        </h3>
        <ul className="space-y-2">
          {summary.payableItems.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 text-[15px]">
              <span>{item.name}</span>
              <span className="font-medium whitespace-nowrap">
                {formatMoney(item.priceCents, summary.currency, locale)}
              </span>
            </li>
          ))}
        </ul>
        <div
          className="mt-4 pt-3 flex items-baseline justify-between text-[15px] font-semibold"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <span>{t("inspire.payable.total")}</span>
          <span>{formatMoney(summary.totalCents, summary.currency, locale)}</span>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--navy-2)" }}>
          {t("inspire.checkout.affiliateExcluded")}
        </p>
      </section>

      {/* ---- The big reassurance ---- */}
      <div
        className="rounded-xl px-5 py-4 text-[16px] font-medium"
        style={{ background: "var(--pink-light)", color: "var(--pink)" }}
        role="note"
      >
        {t("inspire.checkout.note")}
      </div>

      {/* ---- Stripe Payment Element (SetupIntent — saves the card only) ---- */}
      <section className="surface-card p-6">
        <Elements stripe={stripe} options={{ clientSecret }}>
          <PaymentForm onConfirmed={onConfirmed} onBack={onBack} submitLabel={submitLabel} />
        </Elements>
      </section>
    </div>
  );
}
