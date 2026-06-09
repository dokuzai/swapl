import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getDictionary } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Contact · swapl",
  description: "Email, press, and 24/7 active-swap support for swapl members and hosts.",
};

const CHANNELS: {
  label: DictKey;
  value: DictKey;
  href: (v: string) => string;
}[] = [
  { label: "contact.emailLabel", value: "contact.emailValue", href: (v) => `mailto:${v}` },
  { label: "contact.pressLabel", value: "contact.pressValue", href: (v) => `mailto:${v}` },
  { label: "contact.supportLabel", value: "contact.supportValue", href: (v) => `tel:${v.replace(/[^+\d]/g, "")}` },
];

export default async function ContactPage() {
  const dict = await getDictionary();
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <section className="wrap py-20 max-w-3xl">
          <p className="kicker mb-3">{dict["contact.kicker"]}</p>
          <h1 className="font-display text-5xl lg:text-6xl tracking-[-0.03em] leading-[1.02] font-medium">
            {dict["contact.title"]}
          </h1>
          <p className="mt-5 text-[18px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            {dict["contact.lede"]}
          </p>

          <ul className="mt-12 grid gap-4">
            {CHANNELS.map((c) => {
              const v = dict[c.value];
              return (
                <li key={c.label} className="surface-card p-6 flex flex-col gap-1">
                  <span
                    className="font-mono text-[11px] uppercase tracking-[.14em]"
                    style={{ color: "var(--navy-3)" }}
                  >
                    {dict[c.label]}
                  </span>
                  <a
                    href={c.href(v)}
                    className="font-display text-2xl tracking-[-0.01em] font-medium"
                    style={{ color: "var(--pink)" }}
                  >
                    {v}
                  </a>
                </li>
              );
            })}
          </ul>

          <p className="mt-8 text-sm" style={{ color: "var(--navy-3)" }}>
            {dict["contact.responseNote"]}
          </p>
        </section>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
