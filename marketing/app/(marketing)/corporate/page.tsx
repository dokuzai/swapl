import Link from "next/link";
import { CtaWaitlist } from "@/components/marketing/cta";
import { CorporateLeadForm } from "@/components/billing/corporate-lead-form";
import { CorporateCalculator } from "@/components/billing/corporate-calculator";

export const metadata = {
  title: "swapl for companies · swapl",
  description:
    "Give relocating employees access to global homes — at a fraction of serviced-apartment cost, fully insured.",
};

export default function CorporatePage() {
  return (
    <>
      <section className="wrap py-20 lg:py-28">
        <p className="kicker mb-3">For companies</p>
        <h1 className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium max-w-[20ch] text-balance">
          Housing benefits employees actually <span className="h-em">use</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
          Replace serviced apartments and overpriced corporate stays with the swapl network. Each
          seat unlocks Pro features — unlimited listings, priority match, listing analytics — for
          one employee, billed annually in EUR.
        </p>
      </section>

      <section className="border-t border-line py-16" style={{ borderColor: "var(--line)" }}>
        <div className="wrap grid gap-10 lg:grid-cols-3">
          {[
            { kicker: "Cheaper than hotels", title: "€199 / seat / year", body: "Minimum 5 seats. Compare to €180+/night for a furnished serviced apartment." },
            { kicker: "Global inventory", title: "Across 92 countries", body: "Employees on long projects swap with hosts already in the destination." },
            { kicker: "Insurance included", title: "€150k cover · auto-issued", body: "Property + liability + trip interruption every time a swap is accepted. No upsell, no opt-in." },
          ].map((c) => (
            <article key={c.kicker} className="surface-card p-7">
              <p className="kicker mb-3">{c.kicker}</p>
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-3">{c.title}</h2>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-16" style={{ borderColor: "var(--line)" }}>
        <div className="wrap grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <p className="kicker mb-3">Calculator</p>
            <h2 className="font-display text-3xl tracking-[-0.02em] mb-4">How much do you save?</h2>
            <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
              Drag the slider to see annual cost vs. an industry-average serviced apartment at
              €180/night × 30 nights × 4 trips/year per employee.
            </p>
            <CorporateCalculator />
          </div>
          <div>
            <p className="kicker mb-3">Get a demo</p>
            <h2 className="font-display text-3xl tracking-[-0.02em] mb-4">Talk to us</h2>
            <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
              We'll walk through how your team would use swapl, send a sample policy, and a 14-day
              pilot agreement. Smaller teams (5–25 seats) can self-serve via{" "}
              <Link href="#self-serve" className="font-medium" style={{ color: "var(--pink)" }}>self-serve checkout</Link>.
            </p>
            <CorporateLeadForm />
          </div>
        </div>
      </section>

      <section id="self-serve" className="border-t border-line py-16" style={{ borderColor: "var(--line)" }}>
        <div className="wrap max-w-2xl">
          <p className="kicker mb-3">Self-serve</p>
          <h2 className="font-display text-3xl tracking-[-0.02em] mb-4">Buy seats now</h2>
          <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
            Stripe-billed annually. Add or remove seats anytime through the org dashboard.
          </p>
          <CorporateCalculator showCheckout />
        </div>
      </section>

      <CtaWaitlist />
    </>
  );
}
