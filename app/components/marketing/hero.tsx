import Link from "next/link";
import { CityIllust, SwapArrows } from "@/components/illustrations";

export function Hero() {
  return (
    <section className="hero relative overflow-hidden py-20 lg:py-28">
      <div className="wrap">
        <div className="grid items-center gap-12 lg:gap-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="kicker mb-5 inline-flex items-center gap-2">
              <span className="block w-6 h-px bg-navy-3" style={{ background: "var(--navy-3)" }} />
              Home swap · No money, just keys
            </span>
            <h1 className="font-display font-medium leading-[0.98] tracking-[-0.035em]" style={{ fontSize: "clamp(44px, 7vw, 96px)" }}>
              Trade your home<br />for <span className="h-em">someone else&rsquo;s</span>.
            </h1>
            <p className="mt-7 text-[clamp(16px,1.4vw,20px)] text-[color-mix(in_oklab,var(--navy)_75%,transparent)] max-w-[52ch] leading-[1.5]">
              List your place with ruthless accuracy. Browse thousands of homes from Istanbul to Amsterdam, Tokyo to CDMX. When you find a match, you swap — keys for keys, no cash changing hands. Every stay is insured, end to end.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/listings/new" className="pill-primary">
                List my home
                <SwapArrows color="currentColor" size={16} />
              </Link>
              <Link href="/how-it-works" className="pill-ghost">
                See how it works
              </Link>
            </div>
          </div>

          <HeroSplitVisual />
        </div>
      </div>
    </section>
  );
}

function HeroSplitVisual() {
  return (
    <div className="relative aspect-[4/5] w-full">
      <div
        className="absolute top-[2%] left-0 w-[62%] aspect-[4/5] overflow-hidden rounded-2xl border surface-card"
        style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
      >
        <CityIllust city="Istanbul" palette="warm" />
        <div className="p-4 border-t border-line" style={{ borderColor: "var(--line)" }}>
          <div className="font-mono text-[10px] tracking-[.1em] text-navy-3" style={{ color: "var(--navy-3)" }}>OFFERING</div>
          <div className="font-display text-[22px] tracking-[-0.01em] mt-1">Cihangir flat · Istanbul</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--navy-3)" }}>140m² · sleeps 4 · Bosphorus view</div>
        </div>
      </div>

      <div
        className="absolute bottom-[2%] right-0 w-[62%] aspect-[4/5] overflow-hidden rounded-2xl border surface-card"
        style={{
          borderColor: "var(--line)",
          background: "var(--card-bg)",
          boxShadow: "0 20px 40px -20px rgba(0,0,0,.18)",
        }}
      >
        <CityIllust city="Amsterdam" palette="cool" />
        <div className="p-4 border-t" style={{ borderColor: "var(--line)" }}>
          <div className="font-mono text-[10px] tracking-[.1em]" style={{ color: "var(--navy-3)" }}>IN EXCHANGE</div>
          <div className="font-display text-[22px] tracking-[-0.01em] mt-1">Canal loft · Amsterdam</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--navy-3)" }}>92m² · sleeps 3 · bikes incl.</div>
        </div>
      </div>

      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full grid place-items-center z-10 text-white"
        style={{ background: "var(--pink)", boxShadow: "0 8px 24px -8px rgba(0,0,0,.4)" }}
      >
        <SwapArrows color="currentColor" size={32} />
      </div>
    </div>
  );
}
