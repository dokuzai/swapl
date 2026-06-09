import Link from "next/link";
import { CalendarDays, Home, SearchCheck, ShieldCheck } from "lucide-react";
import { appUrl } from "@/lib/app-url";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";

const ICONS = [Home, SearchCheck, CalendarDays];

const EN_COPY = {
  kicker: "September launch plan",
  title: "Get the homes in first. Let the swaps follow.",
  body:
    "The September launch depends on quality supply, not a generic waitlist. Early hosts get reviewed sooner, surface first in matching, and help shape the city corridors we open with.",
  primaryCta: "Join as a founding host",
  secondaryCta: "Request invite",
  proofs: ["No nightly rates", "No host commission", "Mutual-match search", "Insurance included"],
  steps: [
    {
      label: "June",
      title: "Founding homes",
      body: "Hosts list before launch, verify the details that make swaps work, and hold their place in the first results.",
    },
    {
      label: "July-August",
      title: "City matching",
      body: "We use supply and wishlists to build the first reliable swap corridors between high-demand cities.",
    },
    {
      label: "September",
      title: "Swaps open",
      body: "Accepted matches unlock travel windows, agreements, insurance coverage, and the practical trip handoff.",
    },
  ],
};

const COPY: Partial<Record<Locale, typeof EN_COPY>> = {
  en: EN_COPY,
  it: {
    kicker: "Piano di lancio per settembre",
    title: "Prima le case giuste. Poi gli scambi.",
    body:
      "Il lancio di settembre dipende da case di qualita, non da una waitlist generica. Gli host anticipati vengono revisionati prima, compaiono piu in alto nei match e aiutano a scegliere i corridoi tra citta da aprire.",
    primaryCta: "Diventa host fondatore",
    secondaryCta: "Richiedi invito",
    proofs: ["Nessuna tariffa notte", "Nessuna commissione host", "Ricerca reciproca", "Assicurazione inclusa"],
    steps: [
      {
        label: "Giugno",
        title: "Case fondatrici",
        body: "Gli host pubblicano prima del lancio, verificano i dettagli che rendono possibile lo scambio e tengono il posto nei primi risultati.",
      },
      {
        label: "Luglio-agosto",
        title: "Match tra citta",
        body: "Usiamo offerta e wishlist per costruire i primi corridoi di scambio affidabili tra le citta piu richieste.",
      },
      {
        label: "Settembre",
        title: "Scambi aperti",
        body: "I match accettati sbloccano finestre di viaggio, accordi, copertura assicurativa e consegna pratica del soggiorno.",
      },
    ],
  },
  tr: {
    kicker: "Eylul lansman plani",
    title: "Once evleri topla. Takaslar sonra gelir.",
    body:
      "Eylul lansmani genel bir bekleme listesinden degil, kaliteli arzdan guc alacak. Erken ev sahipleri daha once incelenir, eslesmelerde daha ustte gorunur ve acacagimiz sehir koridorlarini sekillendirir.",
    primaryCta: "Kurucu ev sahibi ol",
    secondaryCta: "Davet iste",
    proofs: ["Gecelik ucret yok", "Ev sahibi komisyonu yok", "Karsilikli eslesme", "Sigorta dahil"],
    steps: [
      {
        label: "Haziran",
        title: "Kurucu evler",
        body: "Ev sahipleri lansmandan once ilan verir, takasi calistiran detaylari dogrular ve ilk sonuclardaki yerini alir.",
      },
      {
        label: "Temmuz-agustos",
        title: "Sehir eslesmeleri",
        body: "Arz ve istek listeleriyle yuksek talep goren sehirler arasinda ilk guvenilir takas koridorlarini kurariz.",
      },
      {
        label: "Eylul",
        title: "Takaslar acilir",
        body: "Kabul edilen eslesmeler seyahat pencerelerini, anlasmalari, sigorta kapsamlarini ve pratik teslim surecini acar.",
      },
    ],
  },
};

export async function LaunchQueue() {
  const locale = await getLocale();
  const copy = COPY[locale] ?? EN_COPY;

  return (
    <section id="launch" className="border-t py-20 lg:py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div
          className="grid gap-10 overflow-hidden border md:grid-cols-[0.9fr_1.1fr]"
          style={{ background: "var(--card-bg)", borderColor: "var(--line)", borderRadius: 8 }}
        >
          <div className="p-7 sm:p-9 lg:p-10" style={{ background: "var(--navy)", color: "var(--cream)" }}>
            <span className="font-mono text-[11px] uppercase tracking-[.14em]" style={{ color: "color-mix(in oklab, var(--cream) 65%, transparent)" }}>
              {copy.kicker}
            </span>
            <h2 className="mt-4 font-display text-[clamp(34px,4.5vw,58px)] font-medium leading-[1.02] tracking-[-0.02em] text-balance">
              {copy.title}
            </h2>
            <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55]" style={{ color: "color-mix(in oklab, var(--cream) 78%, transparent)" }}>
              {copy.body}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {copy.proofs.map((proof) => (
                <span
                  key={proof}
                  className="inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-[.08em]"
                  style={{
                    borderColor: "color-mix(in oklab, var(--cream) 22%, transparent)",
                    color: "color-mix(in oklab, var(--cream) 84%, transparent)",
                    borderRadius: 6,
                  }}
                >
                  <ShieldCheck size={13} style={{ color: "var(--pink)" }} />
                  {proof}
                </span>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={appUrl("/register")} className="pill-primary">
                {copy.primaryCta}
              </Link>
              <Link
                href="#join"
                className="inline-flex items-center justify-center border px-6 py-3 text-sm font-medium"
                style={{ borderColor: "color-mix(in oklab, var(--cream) 35%, transparent)", color: "var(--cream)", borderRadius: 999 }}
              >
                {copy.secondaryCta}
              </Link>
            </div>
          </div>

          <div className="grid gap-0 md:grid-rows-3">
            {copy.steps.map((step, index) => {
              const Icon = ICONS[index] ?? Home;
              return (
                <article
                  key={step.title}
                  className="grid gap-5 p-7 sm:grid-cols-[96px_1fr] sm:p-9"
                  style={{ borderTop: index === 0 ? "0" : "1px solid var(--line)" }}
                >
                  <div
                    className="flex h-[72px] w-[72px] items-center justify-center border"
                    style={{ background: "var(--cream-2)", borderColor: "var(--line)", borderRadius: 8, color: "var(--pink)" }}
                  >
                    <Icon size={28} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[.12em]" style={{ color: "var(--navy-3)" }}>
                      {step.label}
                    </div>
                    <h3 className="mt-2 font-display text-[25px] font-medium leading-[1.1] tracking-[-0.01em]">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-[54ch] text-[14px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
                      {step.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
