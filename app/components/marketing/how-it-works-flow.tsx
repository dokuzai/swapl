import {
  Home,
  Search,
  MessageSquare,
  ShieldCheck,
  KeyRound,
  ArrowLeftRight,
  ArrowRight,
  Check,
} from "lucide-react";

const STEPS = [
  {
    icon: Home,
    title: "List your home",
    you: "Add your place with honest detail — photos, size, the dates you're happy to be away.",
    behind: "It's free. No listing fee, no subscription, no commission. Ever.",
  },
  {
    icon: Search,
    title: "Find a match",
    you: "Browse homes and filter by city, size, dates and amenities. We rank them by how well you fit each other.",
    behind: "A swap works when you'd each enjoy the other's home — at the same time, or on dates that suit you both.",
  },
  {
    icon: MessageSquare,
    title: "Propose a swap",
    you: "Send a proposal with your dates. The other host can accept, decline, or counter with different dates — you go back and forth until you agree.",
    behind: "Nothing is committed until both of you say yes. No money is requested at any point.",
  },
  {
    icon: ShieldCheck,
    title: "You're covered — automatically",
    you: "The moment a swap is accepted, you're done negotiating and protected.",
    behind: "An insurance policy is issued instantly, covering both homes for those dates. Both hosts are ID-verified, and each of you gets private key-exchange codes.",
  },
  {
    icon: KeyRound,
    title: "Trade keys & travel",
    you: "You stay in their home, they stay in yours. When the dates end, everyone goes home.",
    behind: "No money ever changes hands — it's a trade of keys, not a payment. That's the whole point.",
  },
];

export function HowItWorksFlow() {
  return (
    <section id="how" className="border-t py-20 lg:py-28" style={{ borderColor: "var(--line)" }}>
      <div className="wrap max-w-5xl">
        <div className="max-w-[760px]">
          <span className="kicker">How it works</span>
          <h2 className="section-title mt-3">A swap, start to finish.</h2>
          <p className="mt-4 text-[18px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
            No money changes hands. You trade your home for someone else&apos;s, and every
            accepted swap is insured. Here&apos;s exactly what happens, step by step.
          </p>
        </div>

        {/* The core idea, made obvious */}
        <div
          className="mt-10 grid items-center gap-4 rounded-2xl border p-6 sm:grid-cols-[1fr_auto_1fr]"
          style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
        >
          <SwapSide label="Your home" sub="They stay here while you're away" />
          <div className="flex flex-col items-center gap-2 py-2">
            <ArrowLeftRight size={28} style={{ color: "var(--pink)" }} />
            <span className="font-mono text-[11px] uppercase tracking-[.12em]" style={{ color: "var(--navy-3)" }}>
              keys for keys
            </span>
          </div>
          <SwapSide label="Their home" sub="You stay here at the same time" />
        </div>

        {/* The step-by-step timeline */}
        <ol className="mt-12 space-y-0">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const last = i === STEPS.length - 1;
            return (
              <li key={step.title} className="relative grid grid-cols-[auto_1fr] gap-5 pb-10">
                {/* rail */}
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--navy)", color: "var(--cream)" }}
                  >
                    <Icon size={22} />
                  </div>
                  {!last && (
                    <span
                      aria-hidden
                      className="mt-1 w-px flex-1"
                      style={{ background: "var(--line)" }}
                    />
                  )}
                </div>

                {/* content */}
                <div className="pt-1">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[12px]" style={{ color: "var(--pink)" }}>
                      Step {i + 1}
                    </span>
                    <h3 className="font-display text-[24px] leading-[1.15] tracking-[-0.01em] font-medium">
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-[16px] leading-[1.55]" style={{ color: "var(--navy)" }}>
                    {step.you}
                  </p>
                  <p
                    className="mt-2 flex gap-2 text-[14px] leading-[1.5]"
                    style={{ color: "var(--navy-3)" }}
                  >
                    <Check size={16} className="mt-0.5 shrink-0" style={{ color: "var(--pink)" }} />
                    <span>{step.behind}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Reassurance + CTA */}
        <div
          className="mt-4 flex flex-col items-start justify-between gap-5 rounded-2xl border p-6 sm:flex-row sm:items-center"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[.1em]" style={{ color: "var(--navy-2)" }}>
            <span className="flex items-center gap-1.5"><Check size={14} style={{ color: "var(--pink)" }} />No money</span>
            <span className="flex items-center gap-1.5"><Check size={14} style={{ color: "var(--pink)" }} />Every swap insured</span>
            <span className="flex items-center gap-1.5"><Check size={14} style={{ color: "var(--pink)" }} />ID-verified hosts</span>
          </div>
          <a href="/register" className="pill-primary whitespace-nowrap">
            List your home
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

function SwapSide({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--line)" }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "var(--pink-light)", color: "var(--pink)" }}
      >
        <Home size={20} />
      </div>
      <div>
        <div className="font-display text-[18px] tracking-[-0.01em]">{label}</div>
        <div className="text-[13px] leading-snug" style={{ color: "var(--navy-3)" }}>
          {sub}
        </div>
      </div>
    </div>
  );
}
