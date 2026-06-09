import Link from "next/link";
import { LogoMark } from "@/components/illustrations";
import { appUrl } from "@/lib/app-url";
import { getI18n } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

// Marketing site has no session — "Homes" points into the product app, and
// the auth slots always render Sign in / List your home CTAs.
const NAV_LINKS: { href: string; key: DictKey }[] = [
  { href: "/how-it-works", key: "nav.howItWorks" },
  { href: appUrl("/listings"), key: "nav.homes" },
  { href: "/blog", key: "nav.blog" },
  { href: "/insurance", key: "nav.insurance" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/corporate", key: "nav.companies" },
];

export async function Navbar() {
  const { locale, dict } = await getI18n();

  return (
    <header className="sticky top-0 z-50 nav-blurred border-b border-line">
      <nav className="wrap flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-[22px] font-medium tracking-tight">
          <LogoMark color="var(--navy)" accent="var(--pink)" />
          <span>
            swapl<span style={{ color: "var(--pink)" }}>.</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link">
              {dict[l.key]}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LocaleSwitcher locale={locale} label={dict["locale.label"]} />
          <Link href={appUrl("/login")} className="hidden sm:inline-flex nav-link">
            {dict["nav.signIn"]}
          </Link>
          <Link href={appUrl("/register")} className="pill-primary">
            {dict["nav.listMyHome"]}
          </Link>
        </div>
      </nav>
    </header>
  );
}
