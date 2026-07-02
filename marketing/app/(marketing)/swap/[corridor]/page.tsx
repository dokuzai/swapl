import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MapPinned, ShieldCheck } from "lucide-react";
import { CityIllust } from "@/components/illustrations";
import { CtaWaitlist } from "@/components/marketing/cta";
import { MarketingTracker } from "@/components/marketing/marketing-tracker";
import { TrackedLink } from "@/components/marketing/tracked-link";
import { CORRIDORS, getCorridor } from "@/lib/marketing/corridors";
import { appUrl } from "@/lib/app-url";

export function generateStaticParams() {
  return CORRIDORS.map((c) => ({ corridor: c.slug }));
}

export async function generateMetadata(props: PageProps<"/swap/[corridor]">): Promise<Metadata> {
  const { corridor } = await props.params;
  const c = getCorridor(corridor);
  if (!c) return { title: "Not found" };

  const title = `${c.to.city} home swap from ${c.from.city}`;
  return {
    title,
    description: `Swap your ${c.from.city} home for a place in ${c.to.city} — no nightly rates, every swap backed by the Swapl Guarantee. Join founding hosts before the September 2026 swapl launch.`,
    alternates: { canonical: `/swap/${c.slug}` },
    keywords: [
      `${c.to.city} home swap`,
      `${c.to.city} home exchange`,
      `home swap from ${c.from.city}`,
      `${c.from.city} to ${c.to.city} apartment swap`,
      "backed home exchange",
    ],
    openGraph: {
      title: `${c.to.city} ⇄ ${c.from.city} home swaps`,
      description: `Money-free swaps between ${c.from.city} and ${c.to.city}, backed by the Swapl Guarantee. Launching September 2026.`,
      url: `/swap/${c.slug}`,
      type: "website",
    },
  };
}

export default async function CorridorPage(props: PageProps<"/swap/[corridor]">) {
  const { corridor } = await props.params;
  const c = getCorridor(corridor);
  if (!c) notFound();

  const faq = [
    {
      q: `How does a ${c.from.city}–${c.to.city} home swap work?`,
      a: `You list your ${c.from.city} home and propose a swap with a ${c.to.city} host (or accept their proposal). No money changes hands — you trade keys for keys. The moment a swap is accepted, the Swapl Guarantee applies to both homes.`,
    },
    {
      q: `Is it safe to swap my home?`,
      a: `Every accepted swap on swapl is backed by the Swapl Guarantee automatically, hosts are identity-verified, and key-exchange codes are issued per agreement. That is the core difference from informal Facebook swap groups.`,
    },
    {
      q: `What does it cost?`,
      a: `Nothing per stay — there are no nightly rates and no swap fees. swapl is a reciprocal exchange, not a rental.`,
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingTracker pageType={`corridor:${c.slug}`} />

      <section className="border-t py-16 lg:py-24" style={{ borderColor: "var(--line)" }}>
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <span className="kicker">{c.from.city} ⇄ {c.to.city} · September 2026</span>
            <h1 className="mt-4 font-display text-[clamp(40px,6vw,80px)] font-medium leading-[0.98] tracking-[-0.03em] text-balance">
              Home swap from <span className="h-em">{c.from.city}</span> to{" "}
              <span className="h-em">{c.to.city}</span>.
            </h1>
            <p className="mt-6 max-w-[58ch] text-[18px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
              Trade your {c.from.city} home for a place in {c.to.city} — keys for keys, no nightly
              rates, every swap backed by the Swapl Guarantee. {c.to.angle} List before September to be among the
              first {c.from.city}–{c.to.city} swaps surfaced when matching opens.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedLink
                href={appUrl("/register")}
                className="pill-primary"
                eventName="listing_intent_click"
                eventMetadata={{ placement: "corridor_hero", corridor: c.slug }}
              >
                List my {c.from.city} home
                <ArrowRight size={16} />
              </TrackedLink>
              <TrackedLink
                href="#join"
                className="pill-ghost"
                eventName="subscriber_intent_click"
                eventMetadata={{ placement: "corridor_hero", corridor: c.slug }}
              >
                Request invite
              </TrackedLink>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <figure className="overflow-hidden border" style={{ borderColor: "var(--line)", borderRadius: 8, background: "var(--card-bg)" }}>
              <div className="aspect-[4/5]"><CityIllust city={c.from.city} palette={c.from.palette} /></div>
              <figcaption className="border-t p-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--navy-3)" }}>
                <span className="font-mono text-[10px] uppercase tracking-[.12em]">You offer</span>
                <div className="mt-1 font-display text-lg" style={{ color: "var(--navy)" }}>{c.from.city}</div>
              </figcaption>
            </figure>
            <figure className="mt-8 overflow-hidden border" style={{ borderColor: "var(--line)", borderRadius: 8, background: "var(--card-bg)" }}>
              <div className="aspect-[4/5]"><CityIllust city={c.to.city} palette={c.to.palette} /></div>
              <figcaption className="border-t p-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--navy-3)" }}>
                <span className="font-mono text-[10px] uppercase tracking-[.12em]">In exchange</span>
                <div className="mt-1 font-display text-lg" style={{ color: "var(--navy)" }}>{c.to.city}</div>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="border-t py-16 lg:py-20" style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}>
        <div className="wrap grid gap-8 lg:grid-cols-2">
          <article className="border bg-white p-6" style={{ borderColor: "var(--line)", borderRadius: 8 }}>
            <div className="mb-5 flex items-center gap-3">
              <MapPinned size={22} style={{ color: "var(--pink)" }} />
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em]">Where you'd stay in {c.to.city}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.to.neighborhoods.map((n) => (
                <div key={n} className="flex items-center gap-2 text-[15px]" style={{ color: "var(--navy-2)" }}>
                  <CheckCircle2 size={16} style={{ color: "var(--pink)" }} />
                  {n}
                </div>
              ))}
            </div>
          </article>
          <article className="border bg-white p-6" style={{ borderColor: "var(--line)", borderRadius: 8 }}>
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck size={22} style={{ color: "var(--pink)" }} />
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em]">Why swap, not rent</h2>
            </div>
            <ul className="grid gap-3 text-[15px]" style={{ color: "var(--navy-2)" }}>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--pink)" }} />No nightly rates and no swap fees — keys for keys.</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--pink)" }} />Every accepted swap is backed by the Swapl Guarantee the moment it's agreed.</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--pink)" }} />Identity-verified hosts and per-swap key-exchange codes.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="border-t py-16 lg:py-20" style={{ borderColor: "var(--line)" }}>
        <div className="wrap">
          <h2 className="section-title">{c.from.city}–{c.to.city} home swaps, answered</h2>
          <div className="mt-8 grid gap-4">
            {faq.map((item) => (
              <details key={item.q} className="border bg-white p-5" style={{ borderColor: "var(--line)", borderRadius: 8 }}>
                <summary className="cursor-pointer font-display text-xl tracking-[-0.01em]">{item.q}</summary>
                <p className="mt-3 text-[15px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaWaitlist />
    </>
  );
}
