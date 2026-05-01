import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LivePairs } from "@/components/marketing/live-pairs";
import { FilterDemo } from "@/components/marketing/filter-demo";
import { InsuranceSection } from "@/components/marketing/insurance";
import { CtaWaitlist } from "@/components/marketing/cta";

export default function MarketingHome() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <LivePairs />
      <FilterDemo />
      <InsuranceSection />
      <CtaWaitlist />
    </>
  );
}
