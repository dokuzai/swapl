import { getDictionary } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

const CARDS: { n: string; titleKey: DictKey; bodyKey: DictKey }[] = [
  { n: "01", titleKey: "insuranceBand.cardA.title", bodyKey: "insuranceBand.cardA.body" },
  { n: "02", titleKey: "insuranceBand.cardB.title", bodyKey: "insuranceBand.cardB.body" },
  { n: "03", titleKey: "insuranceBand.cardC.title", bodyKey: "insuranceBand.cardC.body" },
];

export async function InsuranceSection() {
  const dict = await getDictionary();
  return (
    <section
      id="trust"
      className="py-24 border-t"
      style={{ background: "var(--navy)", color: "var(--cream)", borderColor: "var(--line)" }}
    >
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="font-mono text-[11px] tracking-[.14em] uppercase" style={{ color: "color-mix(in oklab, var(--cream) 60%, transparent)" }}>
            <span style={{ color: "var(--pink)" }}>§ </span>{dict["insuranceBand.kicker"]}
          </span>
          <h2 className="section-title mt-3" style={{ color: "var(--cream)" }}>
            {dict["insuranceBand.title"]} <span className="h-em" style={{ color: "var(--pink)" }}>{dict["insuranceBand.titleEm"]}</span>
          </h2>
          <p className="mt-4 text-[18px] leading-[1.5]" style={{ color: "color-mix(in oklab, var(--cream) 75%, transparent)" }}>
            {dict["insuranceBand.lede"]}
          </p>
        </div>

        <div className="grid gap-7 grid-cols-1 md:grid-cols-3">
          {CARDS.map((c) => (
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
                {dict[c.titleKey]}
              </h3>
              <p className="text-[14px] leading-[1.55]" style={{ color: "color-mix(in oklab, var(--cream) 70%, transparent)" }}>
                {dict[c.bodyKey]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
