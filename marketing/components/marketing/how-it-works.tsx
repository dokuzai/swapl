import { StepIllust } from "@/components/illustrations";
import { getDictionary } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

const STEPS: { n: string; titleKey: DictKey; descKey: DictKey }[] = [
  { n: "01", titleKey: "how.step1.title", descKey: "how.step1.desc" },
  { n: "02", titleKey: "how.step2.title", descKey: "how.step2.desc" },
  { n: "03", titleKey: "how.step3.title", descKey: "how.step3.desc" },
  { n: "04", titleKey: "how.step4.title", descKey: "how.step4.desc" },
];

export async function HowItWorks() {
  const dict = await getDictionary();
  return (
    <section id="how" className="border-t border-line py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="kicker">{dict["how.kicker"]}</span>
          <h2 className="section-title mt-3">{dict["how.title"]}</h2>
          <p className="mt-4 text-[18px] text-navy-2 max-w-[56ch] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            {dict["how.lede"]}
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <article key={s.n} className="surface-card p-7">
              <div className="font-mono text-[12px] mb-5" style={{ color: "var(--navy-3)" }}>
                {s.n}
              </div>
              <div className="h-[96px] flex items-center mb-5">
                <StepIllust step={(i + 1) as 1 | 2 | 3 | 4} palette="playful" />
              </div>
              <h3 className="font-display text-[22px] leading-[1.15] tracking-[-0.01em] font-medium mb-2">
                {dict[s.titleKey]}
              </h3>
              <p className="text-[14px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
                {dict[s.descKey]}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
