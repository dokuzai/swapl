import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LivePairs } from "@/components/marketing/live-pairs";
import { FilterDemo } from "@/components/marketing/filter-demo";
import { InsuranceSection } from "@/components/marketing/insurance";
import { CtaWaitlist } from "@/components/marketing/cta";
import { LaunchBanner } from "@/components/marketing/launch-banner";

export default function MarketingHome() {
  return (
    <>
      <LaunchBanner />
      <Hero />
      <HowItWorks />
      <LivePairs />
      <FilterDemo />
      <InsuranceSection />
      <CtaWaitlist />
    </>
  );
}
