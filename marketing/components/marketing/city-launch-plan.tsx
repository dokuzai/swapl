import Link from "next/link";
import { ArrowRight, MapPinned } from "lucide-react";
import { appUrl } from "@/lib/app-url";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";

const CITY_CLUSTERS = [
  {
    city: "Istanbul",
    role: "Founding supply",
    focus: "Cihangir, Moda, Bomonti, Galata",
    demand: "Amsterdam, Berlin, Lisbon, London",
  },
  {
    city: "Amsterdam",
    role: "High-demand corridor",
    focus: "Jordaan, De Pijp, Oost, Noord",
    demand: "Istanbul, Paris, Brooklyn, Tokyo",
  },
  {
    city: "Lisbon",
    role: "September travel window",
    focus: "Alfama, Principe Real, Santos, Graca",
    demand: "CDMX, Berlin, Istanbul, Seoul",
  },
  {
    city: "Brooklyn",
    role: "Long-haul anchor",
    focus: "Fort Greene, Williamsburg, Park Slope",
    demand: "Paris, Amsterdam, CDMX, Tokyo",
  },
];

const EN_SECTION_COPY = {
  kicker: "Launch motion",
  title: "Push city by city, not everywhere at once.",
  body:
    "Home swapping is a marketplace with a trust threshold. The launch should concentrate supply in a few cities where hosts already want each other, then widen as matches become obvious.",
  cta: "Add your city",
  neighborhood: "Neighborhood focus",
  wantedBy: "Wanted by",
  actions: [
    "Recruit 250 detailed homes in the first launch cities.",
    "Collect destination wishlists before opening proposals.",
    "Prioritize reciprocal city corridors over broad vanity coverage.",
    "Turn host referrals into neighborhood-level supply density.",
  ],
};

const SECTION_COPY: Partial<Record<Locale, typeof EN_SECTION_COPY>> = {
  en: EN_SECTION_COPY,
  it: {
    kicker: "Movimento di lancio",
    title: "Spingere citta per citta, non ovunque insieme.",
    body:
      "Lo scambio casa e un marketplace con una soglia di fiducia. Il lancio deve concentrare l'offerta in poche citta dove gli host si cercano gia, poi allargarsi quando i match diventano evidenti.",
    cta: "Aggiungi la tua citta",
    neighborhood: "Quartieri focus",
    wantedBy: "Richiesta da",
    actions: [
      "Reclutare 250 case dettagliate nelle prime citta di lancio.",
      "Raccogliere wishlist di destinazione prima di aprire le proposte.",
      "Dare priorita ai corridoi reciproci invece che alla copertura ampia.",
      "Trasformare i referral degli host in densita di quartiere.",
    ],
  },
  tr: {
    kicker: "Lansman hareketi",
    title: "Her yerde ayni anda degil, sehir sehir ilerle.",
    body:
      "Ev takasi guven esigi olan bir pazaryeridir. Lansman, ev sahiplerinin birbirini zaten istedigi birkac sehirde arz yogunlastirmali, sonra eslesmeler netlestikce genislemeli.",
    cta: "Sehrini ekle",
    neighborhood: "Mahalle odagi",
    wantedBy: "Talep edenler",
    actions: [
      "Ilk lansman sehirlerinde 250 detayli ev topla.",
      "Teklifleri acmadan once hedef wishlistlerini topla.",
      "Genis gorunurluk yerine karsilikli sehir koridorlarina oncelik ver.",
      "Ev sahibi referanslarini mahalle bazli arza cevir.",
    ],
  },
};

export async function CityLaunchPlan() {
  const locale = await getLocale();
  const copy = SECTION_COPY[locale] ?? EN_SECTION_COPY;

  return (
    <section className="border-t py-20 lg:py-24" style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}>
      <div className="wrap">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <span className="kicker">{copy.kicker}</span>
            <h2 className="section-title mt-3">{copy.title}</h2>
            <p className="mt-4 max-w-[54ch] text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
              {copy.body}
            </p>

            <div className="mt-8 space-y-3">
              {copy.actions.map((action) => (
                <div key={action} className="flex gap-3 text-[15px] leading-[1.45]" style={{ color: "var(--navy-2)" }}>
                  <span
                    className="mt-1 grid h-5 w-5 shrink-0 place-items-center font-mono text-[10px]"
                    style={{ background: "var(--pink)", color: "#fff", borderRadius: 6 }}
                  >
                    OK
                  </span>
                  <span>{action}</span>
                </div>
              ))}
            </div>

            <Link href={appUrl("/register")} className="pill-primary mt-9">
              {copy.cta}
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {CITY_CLUSTERS.map((cluster) => (
              <article
                key={cluster.city}
                className="border bg-white p-5"
                style={{ borderColor: "var(--line)", borderRadius: 8 }}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[.12em]" style={{ color: "var(--navy-3)" }}>
                      {cluster.role}
                    </div>
                    <h3 className="mt-1 font-display text-[28px] font-medium leading-none tracking-[-0.01em]">
                      {cluster.city}
                    </h3>
                  </div>
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center border"
                    style={{ borderColor: "var(--line)", color: "var(--pink)", borderRadius: 8, background: "var(--pink-light)" }}
                  >
                    <MapPinned size={20} />
                  </div>
                </div>
                <dl className="space-y-4 text-[13px] leading-[1.45]">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[.12em]" style={{ color: "var(--navy-3)" }}>
                      {copy.neighborhood}
                    </dt>
                    <dd className="mt-1" style={{ color: "var(--navy-2)" }}>{cluster.focus}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[.12em]" style={{ color: "var(--navy-3)" }}>
                      {copy.wantedBy}
                    </dt>
                    <dd className="mt-1" style={{ color: "var(--navy-2)" }}>{cluster.demand}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
