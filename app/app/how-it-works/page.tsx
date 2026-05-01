import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { CtaWaitlist } from "@/components/marketing/cta";

export const metadata = { title: "How it works · swapl" };

export default function HowItWorksPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="py-20 wrap">
          <p className="kicker mb-3">How it works</p>
          <h1 className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium max-w-[18ch] text-balance">
            Four steps. <span className="h-em">No invoices.</span> Just keys.
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            swapl isn&rsquo;t renting and isn&rsquo;t subletting. It&rsquo;s the oldest form of travel hospitality — two
            families trading homes for a stretch of time, with modern tools to make it safe.
          </p>
        </section>
        <HowItWorks />
        <CtaWaitlist />
      </main>
      <Footer />
    </>
  );
}
