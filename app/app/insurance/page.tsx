import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { InsuranceSection } from "@/components/marketing/insurance";
import { CtaWaitlist } from "@/components/marketing/cta";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Insurance · swapl",
  description:
    "Every swapl stay includes €150,000 cover for property damage, liability and trip interruption — auto-issued, no upsell.",
  openGraph: {
    title: "€150,000 cover on every swap",
    description:
      "Every swapl stay includes cover for property damage, liability and trip interruption — auto-issued, no upsell.",
    images: ["/opengraph-image"],
  },
};

export default function InsurancePage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <section className="py-20 wrap">
          <p className="kicker mb-3">Insurance</p>
          <h1 className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium max-w-[18ch] text-balance">
            Every swap covered. <span className="h-em">No opt-in.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            When you accept a swap, your home is automatically protected — and so is the partner&rsquo;s. There&rsquo;s no
            checkbox, no upsell. You both also get a 24/7 support line and a guaranteed rematch within 48h if a trip is
            interrupted.
          </p>
        </section>

        <InsuranceSection />

        <section className="py-20 wrap max-w-3xl">
          <h2 className="font-display text-3xl tracking-[-0.02em] mb-6">What's covered</h2>
          <dl className="space-y-6 text-[16px] leading-[1.6]">
            <div>
              <dt className="font-display text-xl mb-1">Property damage to €150,000</dt>
              <dd style={{ color: "var(--navy-2)" }}>
                Both homes. Both directions. We pay for repairs or replacement of damaged items, finishings, and structural
                damage caused during the swap window.
              </dd>
            </div>
            <div>
              <dt className="font-display text-xl mb-1">Third-party liability</dt>
              <dd style={{ color: "var(--navy-2)" }}>
                If a guest causes injury or damage to a third party (a neighbour, a passerby, a delivery person), our policy
                handles the legal and medical exposure.
              </dd>
            </div>
            <div>
              <dt className="font-display text-xl mb-1">Trip interruption — rematch in 48h</dt>
              <dd style={{ color: "var(--navy-2)" }}>
                If something falls through (a flight, a partner cancellation, an emergency at home) we either reimburse
                non-refundable travel costs or find you a same-period swap of equal fit within 48 hours.
              </dd>
            </div>
          </dl>
        </section>

        <CtaWaitlist />
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
