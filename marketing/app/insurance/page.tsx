import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { InsuranceSection } from "@/components/marketing/insurance";
import { CtaWaitlist } from "@/components/marketing/cta";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Swapl Guarantee · swapl" };

export default function InsurancePage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <section className="py-20 wrap">
          <p className="kicker mb-3">Guarantee</p>
          <h1 className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium max-w-[18ch] text-balance">
            Every swap backed. <span className="h-em">No opt-in.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            When you accept a swap, the Swapl Guarantee applies automatically — for you and your partner. There&rsquo;s no
            checkbox: a human resolution team helps make things right, and you both get a 24/7 support line and rematch
            help if your plans change.
          </p>
        </section>

        <InsuranceSection />

        <section className="py-20 wrap max-w-3xl">
          <h2 className="font-display text-3xl tracking-[-0.02em] mb-6">What's included</h2>
          <dl className="space-y-6 text-[16px] leading-[1.6]">
            <div>
              <dt className="font-display text-xl mb-1">Goodwill resolution support — free</dt>
              <dd style={{ color: "var(--navy-2)" }}>
                Every swap. Both directions. If something goes wrong, a human resolution team steps in and helps both hosts
                make things right.
              </dd>
            </div>
            <div>
              <dt className="font-display text-xl mb-1">Full cover up to €5,000 — optional add-on</dt>
              <dd style={{ color: "var(--navy-2)" }}>
                Add Full cover for accidental damage help up to €5,000 during the swap window, with a €750 excess. Choose it
                per swap — no opt-in required for the free baseline.
              </dd>
            </div>
            <div>
              <dt className="font-display text-xl mb-1">Plans change — rematch help</dt>
              <dd style={{ color: "var(--navy-2)" }}>
                If something falls through (a flight, a partner cancellation, an emergency at home) we help you find a
                same-period swap of equal fit.
              </dd>
            </div>
          </dl>
          <p className="mt-6 text-sm" style={{ color: "var(--navy-3)" }}>
            This is a guarantee from swapl, not insurance — no licensed insurer is involved.
          </p>
        </section>

        <CtaWaitlist />
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
