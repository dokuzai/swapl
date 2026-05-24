import { getDictionary } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

const ITEMS: { q: DictKey; a: DictKey }[] = [
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
  { q: "faq.q5", a: "faq.a5" },
  { q: "faq.q6", a: "faq.a6" },
];

export async function Faq() {
  const dict = await getDictionary();
  return (
    <section id="faq" className="border-t border-line py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="kicker">{dict["faq.kicker"]}</span>
          <h2 className="section-title mt-3">{dict["faq.title"]}</h2>
        </div>

        <div className="grid gap-3 max-w-[820px]">
          {ITEMS.map(({ q, a }, i) => (
            <details
              key={q}
              className="surface-card group p-6"
              {...(i === 0 ? { open: true } : {})}
            >
              <summary
                className="cursor-pointer list-none flex items-start justify-between gap-4 font-display text-[20px] leading-[1.25] tracking-[-0.01em] font-medium"
              >
                <span>{dict[q]}</span>
                <span
                  aria-hidden
                  className="select-none font-mono text-[22px] leading-none transition-transform group-open:rotate-45"
                  style={{ color: "var(--pink)" }}
                >
                  +
                </span>
              </summary>
              <p className="mt-4 text-[15px] leading-[1.6]" style={{ color: "var(--navy-2)" }}>
                {dict[a]}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
