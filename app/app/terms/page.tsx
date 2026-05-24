import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getDictionary } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms · swapl" };

const SECTIONS: { title: DictKey; body: DictKey }[] = [
  { title: "terms.s1.title", body: "terms.s1.body" },
  { title: "terms.s2.title", body: "terms.s2.body" },
  { title: "terms.s3.title", body: "terms.s3.body" },
  { title: "terms.s4.title", body: "terms.s4.body" },
  { title: "terms.s5.title", body: "terms.s5.body" },
  { title: "terms.s6.title", body: "terms.s6.body" },
];

export default async function TermsPage() {
  const dict = await getDictionary();
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <section className="wrap py-20 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--navy-3)" }}>
            {dict["terms.updated"]}
          </p>
          <h1 className="mt-3 font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium">
            {dict["terms.title"]}
          </h1>
          <p className="mt-5 text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            {dict["terms.lede"]}
          </p>

          <dl className="mt-12 space-y-8 text-[16px] leading-[1.6]">
            {SECTIONS.map((s) => (
              <div key={s.title}>
                <dt className="font-display text-xl mb-2 tracking-[-0.01em] font-medium">
                  {dict[s.title]}
                </dt>
                <dd style={{ color: "var(--navy-2)" }}>{dict[s.body]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
