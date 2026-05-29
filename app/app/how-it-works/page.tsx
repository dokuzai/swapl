import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Faq } from "@/components/marketing/faq";
import { CtaWaitlist } from "@/components/marketing/cta";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const metadata = {
  title: "How it works · swapl",
  description:
    "How swapl works: list your home, match with verified hosts, and swap keys. Every stay covered up to €150,000.",
  openGraph: {
    title: "How swapl works",
    description:
      "List your home, match with verified hosts, and swap keys. Every stay covered up to €150,000.",
    images: ["/opengraph-image"],
  },
};

export const dynamic = "force-dynamic";

// The HowItWorks marketing component already owns the "Four steps. No
// invoices. Just keys." title + lede, so we don't repeat it as a separate
// page header.
export default function HowItWorksPage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <HowItWorks />
        <Faq />
        <CtaWaitlist />
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
