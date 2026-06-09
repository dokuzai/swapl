import Link from "next/link";
import { PricingTable } from "@/components/billing/pricing-table";
import { CtaWaitlist } from "@/components/marketing/cta";
import { getDictionary } from "@/lib/i18n/server";

export const metadata = {
  title: "Pricing · swapl",
  description: "Free to swap. Plus and Pro unlock saved searches, priority placement, listing analytics, and more.",
};

export default async function PricingPage() {
  const dict = await getDictionary();
  return (
    <>
      <section className="wrap py-20 lg:py-28">
        <p className="kicker mb-3">{dict["pricing.kicker"]}</p>
        <h1
          className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium max-w-[18ch] text-balance"
        >
          {dict["pricing.title"]} <span className="h-em">{dict["pricing.titleEm"]}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
          {dict["pricing.lede"]}
        </p>
        <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-full text-sm" style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}>
          <span>{dict["pricing.tags.noFees"]}</span>
          <span>{dict["pricing.tags.noCommission"]}</span>
          <span>{dict["pricing.tags.insurance"]}</span>
        </div>
      </section>

      <section className="border-t border-line py-20" style={{ borderColor: "var(--line)" }}>
        <div className="wrap">
          <PricingTable />
          <p className="mt-8 text-sm text-center" style={{ color: "var(--navy-3)" }}>
            {dict["pricing.legal"]}{" "}
            <Link href="/account/billing" style={{ color: "var(--pink)" }} className="font-medium">
              {dict["pricing.manageBilling"]}
            </Link>
          </p>
        </div>
      </section>

      <CtaWaitlist />
    </>
  );
}
