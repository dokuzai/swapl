import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { AppShowcase } from "@/components/marketing/app-showcase";
import { LivePairs } from "@/components/marketing/live-pairs";
import { FilterDemo } from "@/components/marketing/filter-demo";
import { InsuranceSection } from "@/components/marketing/insurance";
import { CtaWaitlist } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { LaunchBanner } from "@/components/marketing/launch-banner";
import { LaunchQueue } from "@/components/marketing/launch-queue";
import { CityLaunchPlan } from "@/components/marketing/city-launch-plan";
import { MarketingStructuredData } from "@/components/marketing/structured-data";
import { MarketingTracker } from "@/components/marketing/marketing-tracker";

export default function MarketingHome() {
  return (
    <>
      <MarketingStructuredData />
      <MarketingTracker pageType="homepage" />
      <LaunchBanner />
      <Hero />
      <LaunchQueue />
      <HowItWorks />
      <LivePairs />
      <CityLaunchPlan />
      <AppShowcase />
      <FilterDemo />
      <InsuranceSection />
      <Faq />
      <CtaWaitlist />
    </>
  );
}
