"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { appUrl } from "@/lib/app-url";

type Plan = {
  id: "free" | "plus" | "pro";
  label: string;
  blurb: string;
  monthly: number; // EUR
  yearly: number;  // EUR
  features: Array<{ label: string; on: boolean }>;
  cta: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    label: "Free",
    blurb: "List one home, swap freely.",
    monthly: 0,
    yearly: 0,
    cta: "Current plan",
    features: [
      { label: "1 home listing", on: true },
      { label: "3 swap proposals / month", on: true },
      { label: "Basic filters", on: true },
      { label: "Swapl Guarantee on every swap", on: true },
      { label: "Calendar sync (iCal / Google)", on: false },
      { label: "Saved searches with alerts", on: false },
      { label: "Match-score breakdown", on: false },
      { label: "Listing analytics", on: false },
      { label: "Verified badge", on: false },
      { label: "Multi-home / team account", on: false },
    ],
  },
  {
    id: "plus",
    label: "swapl Plus",
    blurb: "For active swappers.",
    monthly: 12,
    yearly: 99,
    cta: "Upgrade to Plus",
    highlight: true,
    features: [
      { label: "3 home listings", on: true },
      { label: "Unlimited swap proposals", on: true },
      { label: "Full advanced filters (40+ attributes)", on: true },
      { label: "Swapl Guarantee on every swap", on: true },
      { label: "Calendar sync (iCal / Google)", on: true },
      { label: "Up to 20 saved searches with daily alerts", on: true },
      { label: "Match-score breakdown", on: true },
      { label: "Priority placement in search", on: true },
      { label: "Listing analytics", on: false },
      { label: "Multi-home / team account", on: false },
    ],
  },
  {
    id: "pro",
    label: "swapl Pro",
    blurb: "Multi-home + team accounts.",
    monthly: 29,
    yearly: 249,
    cta: "Upgrade to Pro",
    features: [
      { label: "Unlimited home listings", on: true },
      { label: "Unlimited swap proposals", on: true },
      { label: "Full advanced filters", on: true },
      { label: "Swapl Guarantee on every swap", on: true },
      { label: "Calendar sync (iCal / Google)", on: true },
      { label: "Saved searches with alerts", on: true },
      { label: "Match-score breakdown", on: true },
      { label: "Top-rank placement in search", on: true },
      { label: "Listing analytics + verified badge", on: true },
      { label: "Multi-home / team account", on: true },
    ],
  },
];

export function PricingTable() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const [pendingPlan, setPendingPlan] = useState<Plan["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function startCheckout(plan: Plan["id"]) {
    if (plan === "free") return;
    setError(null);
    setPendingPlan(plan);
    start(async () => {
      const res = await fetch("/api/billing/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle }),
      });
      if (res.status === 401) {
        window.location.href = appUrl("/login?next=/pricing");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else if (res.status === 503) {
        setError("Checkout isn't available yet — Stripe will be turned on at launch.");
      } else {
        setError(j.error ?? "Couldn't start checkout.");
      }
      setPendingPlan(null);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-8 font-mono text-[12px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
        <button onClick={() => setCycle("monthly")} aria-pressed={cycle === "monthly"}
          className="px-4 py-1.5 rounded-full border"
          style={cycle === "monthly" ? { background: "var(--navy)", color: "var(--cream)", borderColor: "var(--navy)" } : { borderColor: "var(--line)" }}>
          Monthly
        </button>
        <button onClick={() => setCycle("yearly")} aria-pressed={cycle === "yearly"}
          className="px-4 py-1.5 rounded-full border"
          style={cycle === "yearly" ? { background: "var(--navy)", color: "var(--cream)", borderColor: "var(--navy)" } : { borderColor: "var(--line)" }}>
          Yearly · save 30%
        </button>
      </div>

      {error && <p className="text-sm text-center mb-4" style={{ color: "#dc2626" }}>{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = cycle === "monthly" ? plan.monthly : plan.yearly;
          const pricePer = plan.id === "free" ? "" : cycle === "monthly" ? "/month" : "/year";
          return (
            <article
              key={plan.id}
              className="surface-card overflow-hidden p-7 flex flex-col"
              style={plan.highlight ? { borderColor: "var(--pink)", boxShadow: "0 24px 48px -28px rgba(242,75,142,.35)" } : undefined}
            >
              {plan.highlight && (
                <span className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full self-start mb-3"
                  style={{ background: "var(--pink-light)", color: "var(--pink)" }}>
                  Most popular
                </span>
              )}
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{plan.label}</h2>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{plan.blurb}</p>

              <div className="mb-5">
                <span className="font-display text-4xl tracking-[-0.02em]">€{price}</span>
                <span className="text-sm ml-1" style={{ color: "var(--navy-3)" }}>{pricePer}</span>
                {cycle === "yearly" && plan.id !== "free" && (
                  <div className="text-xs mt-1" style={{ color: "var(--navy-3)" }}>
                    €{(plan.yearly / 12).toFixed(2)}/mo billed annually
                  </div>
                )}
              </div>

              <ul className="space-y-2 mb-6 text-sm">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex gap-2 items-start">
                    <span aria-hidden style={{ color: f.on ? "var(--pink)" : "var(--navy-3)" }}>
                      {f.on ? "✓" : "—"}
                    </span>
                    <span style={{ color: f.on ? "var(--navy)" : "var(--navy-3)" }}>{f.label}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {plan.id === "free" ? (
                  <Link href={appUrl("/register")} className="pill-ghost w-full justify-center inline-flex">Get started</Link>
                ) : (
                  <button
                    onClick={() => startCheckout(plan.id)}
                    className="pill-primary w-full justify-center"
                    disabled={pendingPlan !== null}
                  >
                    {pendingPlan === plan.id ? "Loading…" : plan.cta}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
