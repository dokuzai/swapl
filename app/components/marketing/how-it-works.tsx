import { StepIllust } from "@/components/illustrations";

const STEPS = [
  {
    n: "01",
    title: "List with precision",
    desc: "Every window, every socket, every stair. Our listing form captures the details that matter — so your swap partner lands somewhere they already know.",
  },
  {
    n: "02",
    title: "Filter & match",
    desc: "Dial in city, dates, square meters, pets, work-from-home readiness, accessibility. Only homes whose owners want to swap back with you show up.",
  },
  {
    n: "03",
    title: "Propose & agree",
    desc: "Send a swap request with your own home attached. They accept, decline, or counter. Price isn't part of it — one home for the other.",
  },
  {
    n: "04",
    title: "Travel, insured",
    desc: "Every accepted swap is automatically covered: property, liability, and trip interruption. You both get keys, codes, and a 24/7 line.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-line py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="kicker">01 · How it works</span>
          <h2 className="section-title mt-3">Four steps. No invoices. Just keys.</h2>
          <p className="mt-4 text-[18px] text-navy-2 max-w-[56ch] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            Home swapping isn&rsquo;t renting and isn&rsquo;t subletting. It&rsquo;s the oldest form of travel hospitality, with modern tools to make it safe.
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <article
              key={s.n}
              className="surface-card p-7"
            >
              <div className="font-mono text-[12px] mb-5" style={{ color: "var(--navy-3)" }}>
                {s.n}
              </div>
              <div className="h-[96px] flex items-center mb-5">
                <StepIllust step={(i + 1) as 1 | 2 | 3 | 4} palette="playful" />
              </div>
              <h3 className="font-display text-[22px] leading-[1.15] tracking-[-0.01em] font-medium mb-2">
                {s.title}
              </h3>
              <p className="text-[14px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
                {s.desc}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
