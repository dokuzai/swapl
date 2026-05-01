export function InsuranceSection() {
  return (
    <section
      id="trust"
      className="py-24 border-t"
      style={{ background: "var(--navy)", color: "var(--cream)", borderColor: "var(--line)" }}
    >
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="font-mono text-[11px] tracking-[.14em] uppercase" style={{ color: "color-mix(in oklab, var(--cream) 60%, transparent)" }}>
            <span style={{ color: "var(--pink)" }}>§ </span>04 · Insurance, always on
          </span>
          <h2 className="section-title mt-3" style={{ color: "var(--cream)" }}>
            Every swap covered. <span className="h-em" style={{ color: "var(--pink)" }}>No opt-in.</span>
          </h2>
          <p className="mt-4 text-[18px] leading-[1.5]" style={{ color: "color-mix(in oklab, var(--cream) 75%, transparent)" }}>
            Swaps aren&rsquo;t rentals, but they&rsquo;re still two families trusting each other with their homes. We underwrite every accepted exchange automatically — no checkbox, no upsell.
          </p>
        </div>

        <div className="grid gap-7 grid-cols-1 md:grid-cols-3">
          {[
            { n: "01", t: "Property damage to €150k", d: "If something breaks, cracks, floods, or walks off during a swap, it's covered — both directions, both homes." },
            { n: "02", t: "Third-party liability", d: "A guest slips in your kitchen. A pipe bursts next door. Our policy handles it so the swap doesn't turn into a lawsuit." },
            { n: "03", t: "Trip interruption", d: "Flight cancelled, partner pulls out, pandemic? You're reimbursed — or rematched with a home of equal fit within 48 hours." },
          ].map((c) => (
            <div
              key={c.n}
              className="p-7 rounded-2xl border"
              style={{ borderColor: "color-mix(in oklab, var(--cream) 20%, transparent)" }}
            >
              <div
                className="w-11 h-11 rounded-[10px] grid place-items-center mb-5 font-mono text-[14px]"
                style={{ background: "var(--pink)", color: "#fff" }}
              >
                {c.n}
              </div>
              <h3 className="font-display text-[22px] tracking-[-0.01em] font-medium mb-2.5" style={{ color: "var(--cream)" }}>
                {c.t}
              </h3>
              <p className="text-[14px] leading-[1.55]" style={{ color: "color-mix(in oklab, var(--cream) 70%, transparent)" }}>
                {c.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
