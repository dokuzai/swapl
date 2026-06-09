import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HowItWorksFlow } from "@/components/marketing/how-it-works-flow";
import { Faq } from "@/components/marketing/faq";
import { CtaWaitlist } from "@/components/marketing/cta";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "How home swapping works",
  description:
    "A home swap, start to finish: list your home, find a match, propose dates, get insured automatically, and trade keys. No money changes hands.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <HowItWorksFlow />
        <Faq />
        <CtaWaitlist />
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
