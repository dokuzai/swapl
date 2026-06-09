import { CityIllust, SwapArrows, Pin } from "@/components/illustrations";
import type { Palette } from "@/components/illustrations";

type Pair = {
  a: { city: string; neighborhood: string; type: string; sqm: number; sleeps: number; palette: Palette };
  b: { city: string; neighborhood: string; type: string; sqm: number; sleeps: number; palette: Palette };
  dates: string;
  match: number;
  tags: string[];
};

const SWAP_PAIRS: Pair[] = [
  {
    a: { city: "Istanbul", palette: "warm", neighborhood: "Cihangir", type: "3BR flat w/ Bosphorus view", sqm: 140, sleeps: 4 },
    b: { city: "Amsterdam", palette: "cool", neighborhood: "Jordaan", type: "Canal-side loft", sqm: 92, sleeps: 3 },
    dates: "Jun 4 – Jun 18",
    match: 96,
    tags: ["Balcony", "Cat-friendly", "Bike incl."],
  },
  {
    a: { city: "Tokyo", palette: "rose", neighborhood: "Shimokitazawa", type: "Minimalist 1LDK", sqm: 58, sleeps: 2 },
    b: { city: "Lisbon", palette: "sand", neighborhood: "Alfama", type: "Azulejo townhouse", sqm: 110, sleeps: 4 },
    dates: "Sep 12 – Sep 26",
    match: 91,
    tags: ["Quiet street", "WFH desk", "Rooftop"],
  },
  {
    a: { city: "Brooklyn", palette: "dusk", neighborhood: "Fort Greene", type: "Brownstone parlor", sqm: 120, sleeps: 4 },
    b: { city: "CDMX", palette: "sage", neighborhood: "Roma Norte", type: "Art-deco apartment", sqm: 135, sleeps: 5 },
    dates: "Oct 3 – Oct 17",
    match: 88,
    tags: ["Dog OK", "Courtyard", "Piano"],
  },
];

export function LivePairs() {
  return (
    <section id="listings" className="border-t border-line py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="kicker">02 · Homes looking to swap</span>
          <h2 className="section-title mt-3">Real homes. Real swaps. Right now.</h2>
          <p className="mt-4 text-[18px] max-w-[56ch] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            Three live pairs — each home&rsquo;s owner wants the other&rsquo;s. Size, price, and square-meters don&rsquo;t have to match. The only rule: you offer yours to get theirs.
          </p>
        </div>

        <div className="grid gap-7 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {SWAP_PAIRS.map((pair, i) => (
            <article key={i} className="surface-card overflow-hidden">
              <div className="grid items-stretch aspect-[16/9]" style={{ gridTemplateColumns: "1fr auto 1fr", background: "var(--cream-2)" }}>
                <div className="relative overflow-hidden">
                  <div
                    className="absolute top-3 left-3 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-[.08em] z-10 border"
                    style={{ background: "var(--card-bg)", borderColor: "var(--line)", color: "var(--navy)" }}
                  >
                    Yours
                  </div>
                  <CityIllust city={pair.a.city} palette={pair.a.palette} />
                </div>
                <div
                  className="w-11 grid place-items-center"
                  style={{ background: "var(--card-bg)", borderInline: "1px solid var(--line)", color: "var(--pink)" }}
                >
                  <SwapArrows color="currentColor" size={24} />
                </div>
                <div className="relative overflow-hidden">
                  <div
                    className="absolute top-3 right-3 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-[.08em] z-10 border"
                    style={{ background: "var(--card-bg)", borderColor: "var(--line)", color: "var(--navy)" }}
                  >
                    Theirs
                  </div>
                  <CityIllust city={pair.b.city} palette={pair.b.palette} />
                </div>
              </div>
              <div className="p-6">
                <div className="font-display text-[22px] tracking-[-0.01em] font-medium flex items-baseline gap-2 flex-wrap">
                  <span>{pair.a.city}</span>
                  <span style={{ color: "var(--pink)" }}>
                    <SwapArrows color="currentColor" size={18} />
                  </span>
                  <span>{pair.b.city}</span>
                </div>

                <div className="mt-2 flex gap-4 flex-wrap text-[13px]" style={{ color: "var(--navy-3)" }}>
                  <span className="inline-flex items-center gap-2">
                    <Pin color="var(--pink)" size={10} /> {pair.a.neighborhood} ⇄ {pair.b.neighborhood}
                  </span>
                  <span>· {pair.dates}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 gap-x-4 text-[13px] pt-4 divider-dashed">
                  <span>
                    Yours: <b style={{ color: "var(--navy)", fontWeight: 500 }}>{pair.a.sqm}m² · sleeps {pair.a.sleeps}</b>
                  </span>
                  <span>
                    Theirs: <b style={{ color: "var(--navy)", fontWeight: 500 }}>{pair.b.sqm}m² · sleeps {pair.b.sleeps}</b>
                  </span>
                  <span style={{ color: "var(--navy-3)" }}>{pair.a.type}</span>
                  <span style={{ color: "var(--navy-3)" }}>{pair.b.type}</span>
                </div>

                <div className="mt-4 flex gap-2 flex-wrap">
                  <span className="match-badge">{pair.match}% match</span>
                  {pair.tags.map((t) => (
                    <span key={t} className="tag-chip">{t}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
