import Link from "next/link";
import { PricingTable } from "@/components/billing/pricing-table";
import { CtaWaitlist } from "@/components/marketing/cta";

export const metadata = {
  title: "Pricing · swapl",
  description: "Free to swap. Plus and Pro unlock saved searches, priority placement, listing analytics, and more.",
};

export default function PricingPage() {
  return (
    <>
      <section className="wrap py-20 lg:py-28">
        <p className="kicker mb-3">Pricing</p>
        <h1
          className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium max-w-[18ch] text-balance"
        >
          Swapping homes is free. <span className="h-em">Forever.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
          We don&rsquo;t take a cut of your swap. Pay only if you want power-user tools — saved
          searches with alerts, priority placement, multi-home accounts, listing analytics.
          The core swap is, and will stay, the same for everyone.
        </p>
        <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-full text-sm" style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}>
          <span>◦ No swap fees</span>
          <span>◦ No platform commission</span>
          <span>◦ Insurance included on every plan</span>
        </div>
      </section>

      <section className="border-t border-line py-20" style={{ borderColor: "var(--line)" }}>
        <div className="wrap">
          <PricingTable />
          <p className="mt-8 text-sm text-center" style={{ color: "var(--navy-3)" }}>
            All prices in EUR. VAT shown at checkout based on your billing country.
            Cancel anytime — your access continues until the end of the current period.{" "}
            <Link href="/account/billing" style={{ color: "var(--pink)" }} className="font-medium">
              Manage billing
            </Link>
          </p>
        </div>
      </section>

      <CtaWaitlist />
    </>
  );
}
