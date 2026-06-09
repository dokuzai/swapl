"use client";

import { useMemo, useState } from "react";
import { HouseGlyph, type Palette } from "@/components/illustrations";

const ALL_CITIES = ["Istanbul", "Amsterdam", "Tokyo", "Lisbon", "CDMX", "Brooklyn", "Paris", "Marrakesh", "Berlin", "Seoul"];
const ALL_PROPS = ["Apartment", "House", "Loft", "Townhouse"];

type Result = { where: string; sub: string; match: number; palette: Palette };

const RESULTS: Result[] = [
  { where: "Jordaan · Amsterdam", sub: "Canal loft · 92m² · sleeps 3", match: 96, palette: "cool" },
  { where: "Roma Norte · CDMX", sub: "Art-deco · 135m² · sleeps 5", match: 92, palette: "sage" },
  { where: "Alfama · Lisbon", sub: "Azulejo townhouse · 110m²", match: 89, palette: "sand" },
  { where: "Shimokitazawa · Tokyo", sub: "Minimalist 1LDK · 58m²", match: 87, palette: "rose" },
  { where: "Fort Greene · Brooklyn", sub: "Brownstone parlor · 120m²", match: 84, palette: "dusk" },
];

export function FilterDemo() {
  const [cities, setCities] = useState<Set<string>>(new Set(["Tokyo", "Lisbon", "CDMX"]));
  const [props, setProps] = useState<Set<string>>(new Set(["Apartment", "House"]));
  const [sqm, setSqm] = useState(85);
  const [sleeps, setSleeps] = useState(3);
  const [pets, setPets] = useState(true);
  const [wfh, setWfh] = useState(true);
  const [accessible, setAccessible] = useState(false);
  const [mustSwapBack, setMustSwapBack] = useState(true);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  };

  const count = useMemo(() => {
    const base = 4823;
    let c = base;
    c = Math.round(c * (cities.size ? cities.size / 6 + 0.2 : 0.1));
    c = Math.round(c * (props.size ? props.size / 4 + 0.35 : 0.15));
    c = Math.round(c * (pets ? 0.62 : 1));
    c = Math.round(c * (wfh ? 0.74 : 1));
    c = Math.round(c * (accessible ? 0.18 : 1));
    c = Math.round(c * (mustSwapBack ? 0.55 : 1));
    return Math.max(7, c);
  }, [cities, props, pets, wfh, accessible, mustSwapBack]);

  return (
    <section id="match" className="border-t border-line py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="kicker">03 · Find your match</span>
          <h2 className="section-title mt-3">Filters sharp enough to find the one.</h2>
          <p className="mt-4 text-[18px] max-w-[56ch] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            Most listing sites give you city and price. We let you dial in 40+ attributes and — crucially — only show homes whose owners want to swap back with yours.
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] gap-0 overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        >
          <aside
            className="p-5 sm:p-6 md:p-7 border-b md:border-b-0 md:border-r"
            style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
          >
            <FilterGroup label="Destination city">
              <div className="flex flex-wrap gap-1.5">
                {ALL_CITIES.map((c) => (
                  <Chip key={c} on={cities.has(c)} onClick={() => toggle(cities, setCities, c)}>
                    {c}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Property type">
              <div className="flex flex-wrap gap-1.5">
                {ALL_PROPS.map((p) => (
                  <Chip key={p} on={props.has(p)} onClick={() => toggle(props, setProps, p)}>
                    {p}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label={`Minimum size · ${sqm}m²`}>
              <div className="flex items-center gap-3 font-mono text-[12px]" style={{ color: "var(--navy-2)" }}>
                <span>30</span>
                <input
                  type="range"
                  min={30}
                  max={300}
                  value={sqm}
                  onChange={(e) => setSqm(+e.target.value)}
                  className="flex-1"
                />
                <span>300</span>
              </div>
            </FilterGroup>

            <FilterGroup label={`Sleeps at least · ${sleeps}`}>
              <div className="flex items-center gap-3 font-mono text-[12px]" style={{ color: "var(--navy-2)" }}>
                <span>1</span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={sleeps}
                  onChange={(e) => setSleeps(+e.target.value)}
                  className="flex-1"
                />
                <span>8</span>
              </div>
            </FilterGroup>

            <FilterGroup label="Must-haves">
              <ToggleRow label="Pet-friendly" on={pets} onChange={setPets} />
              <ToggleRow label="Work-from-home setup" on={wfh} onChange={setWfh} />
              <ToggleRow label="Step-free access" on={accessible} onChange={setAccessible} />
              <ToggleRow label={<>Only <em>mutual</em> swaps</>} on={mustSwapBack} onChange={setMustSwapBack} />
            </FilterGroup>
          </aside>

          <div className="p-5 sm:p-6 md:p-7 min-w-0">
            <div
              className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-5 pb-4"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div className="font-display text-[18px] sm:text-[22px] tracking-[-0.01em] font-medium leading-snug">
                <b style={{ color: "var(--pink)", fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString()}</b> homes ready to swap
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                Sort: match score ↓
              </div>
            </div>

            {RESULTS.map((r, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-3 sm:gap-4 py-3.5 text-sm"
                style={{
                  borderBottom: i === RESULTS.length - 1 ? "0" : "1px dashed var(--line)",
                }}
              >
                <div
                  className="w-12 h-12 rounded grid place-items-center overflow-hidden shrink-0"
                  style={{ background: "var(--cream-2)" }}
                >
                  <HouseGlyph palette={r.palette} style={{ width: "80%", height: "80%" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[15px] sm:text-[16px] tracking-[-0.01em] font-medium truncate">
                    {r.where}
                  </div>
                  <div className="text-[12px] mt-0.5 truncate" style={{ color: "var(--navy-3)" }}>
                    {r.sub}
                  </div>
                </div>
                <div
                  className="font-mono text-[11px] px-2 py-0.5 rounded shrink-0"
                  style={{ background: "color-mix(in oklab, var(--pink) 15%, transparent)", color: "var(--pink)" }}
                >
                  {r.match}% match
                </div>
                <div
                  className="font-mono text-[11px] uppercase tracking-[.08em] px-2.5 py-1.5 rounded-full border shrink-0 whitespace-nowrap ml-auto"
                  style={{ borderColor: "var(--line)", color: "var(--navy-2)" }}
                >
                  Propose swap
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-7 last:mb-0">
      <label className="block font-mono text-[10px] uppercase tracking-[.12em] mb-3" style={{ color: "var(--navy-3)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
      style={
        on
          ? { background: "var(--pink)", color: "#fff", borderColor: "var(--pink)" }
          : { background: "var(--card-bg)", color: "var(--navy-2)", borderColor: "var(--line)" }
      }
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: React.ReactNode;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm" style={{ borderTop: "1px solid var(--line)" }}>
      <span>{label}</span>
      <div role="switch" aria-checked={on} tabIndex={0} className="swapl-switch" data-on={on} onClick={() => onChange(!on)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!on)} />
    </div>
  );
}
