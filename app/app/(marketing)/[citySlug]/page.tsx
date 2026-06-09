import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MapPinned, ShieldCheck } from "lucide-react";
import { CityIllust } from "@/components/illustrations";
import { CtaWaitlist } from "@/components/marketing/cta";
import { MarketingTracker } from "@/components/marketing/marketing-tracker";
import { TrackedLink } from "@/components/marketing/tracked-link";
import { CITY_LAUNCH_PAGES, getCityLaunchPage } from "@/lib/marketing/city-launch";

export function generateStaticParams() {
  return CITY_LAUNCH_PAGES.map((page) => ({ citySlug: page.slug }));
}

export async function generateMetadata(props: PageProps<"/[citySlug]">): Promise<Metadata> {
  const { citySlug } = await props.params;
  const page = getCityLaunchPage(citySlug);
  if (!page) return { title: "Not found" };

  return {
    title: `${page.city} home swap launch`,
    description: `List your ${page.city} home before the September 2026 swapl launch. Join founding hosts for insured, money-free home exchanges.`,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      title: `${page.city} home swaps launching September 2026`,
      description: page.angle,
      url: `/${page.slug}`,
      type: "website",
    },
  };
}

export default async function CityLaunchPage(props: PageProps<"/[citySlug]">) {
  const { citySlug } = await props.params;
  const page = getCityLaunchPage(citySlug);
  if (!page) notFound();

  return (
    <>
      <MarketingTracker pageType={`city_launch:${page.slug}`} />
      <section className="border-t py-16 lg:py-24" style={{ borderColor: "var(--line)" }}>
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <span className="kicker">September 2026 launch city</span>
            <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(48px,7vw,92px)] font-medium leading-[0.96] tracking-[-0.03em] text-balance">
              Home swaps in <span className="h-em">{page.city}</span>.
            </h1>
            <p className="mt-6 max-w-[56ch] text-[18px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
              Keys for keys — no money changes hands, and every accepted swap is insured end to end. {page.angle} List before September to become a founding host, show up early in matching, and help build the first real swap routes for {page.city}.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedLink
                href="/register"
                className="pill-primary"
                eventName="listing_intent_click"
                eventMetadata={{ placement: "city_hero", city: page.city }}
              >
                List a {page.city} home
                <ArrowRight size={16} />
              </TrackedLink>
              <TrackedLink
                href="#join"
                className="pill-ghost"
                eventName="subscriber_intent_click"
                eventMetadata={{ placement: "city_hero", city: page.city }}
              >
                Request invite
              </TrackedLink>
            </div>
          </div>

          <div
            className="overflow-hidden border"
            style={{ background: "var(--card-bg)", borderColor: "var(--line)", borderRadius: 8 }}
          >
            <div className="aspect-[16/11]">
              <CityIllust city={page.city} palette={page.palette} />
            </div>
            <div className="grid gap-4 border-t p-5 sm:grid-cols-3" style={{ borderColor: "var(--line)" }}>
              {page.proof.map((item) => (
                <div key={item} className="flex gap-2 text-sm leading-snug" style={{ color: "var(--navy-2)" }}>
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: "var(--pink)" }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t py-16 lg:py-20" style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}>
        <div className="wrap grid gap-8 lg:grid-cols-2">
          <article className="border bg-white p-6" style={{ borderColor: "var(--line)", borderRadius: 8 }}>
            <div className="mb-5 flex items-center gap-3">
              <MapPinned size={22} style={{ color: "var(--pink)" }} />
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em]">Neighborhood focus</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {page.neighborhoods.map((neighborhood) => (
                <div key={neighborhood} className="flex items-center gap-2 text-[15px]" style={{ color: "var(--navy-2)" }}>
                  <CheckCircle2 size={16} style={{ color: "var(--pink)" }} />
                  {neighborhood}
                </div>
              ))}
            </div>
          </article>

          <article className="border bg-white p-6" style={{ borderColor: "var(--line)", borderRadius: 8 }}>
            <div className="mb-5 flex items-center gap-3">
              <ArrowRight size={22} style={{ color: "var(--pink)" }} />
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em]">Early demand from</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {page.demandFrom.map((city) => (
                <div key={city} className="flex items-center gap-2 text-[15px]" style={{ color: "var(--navy-2)" }}>
                  <CheckCircle2 size={16} style={{ color: "var(--pink)" }} />
                  {city}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="border-t py-16 lg:py-20" style={{ borderColor: "var(--line)" }}>
        <div className="wrap grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="kicker">Founding host advantage</span>
            <h2 className="section-title mt-3">Why list before September?</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Reviewed sooner for launch readiness.",
              "Shown earlier when reciprocal matches open.",
              "Used to shape the first city corridors.",
            ].map((item, index) => (
              <div key={item} className="border bg-white p-5" style={{ borderColor: "var(--line)", borderRadius: 8 }}>
                <div className="font-mono text-[11px] uppercase tracking-[.12em]" style={{ color: "var(--pink)" }}>
                  0{index + 1}
                </div>
                <p className="mt-3 text-[15px] leading-[1.45]" style={{ color: "var(--navy-2)" }}>
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaWaitlist />
    </>
  );
}
