import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { marketingUrl } from "@/lib/marketing/urls";

export async function Footer() {
  const dict = await getDictionary();
  return (
    <footer className="mt-auto py-4 font-mono text-[13px] text-navy-3">
      <div className="wrap">
        <div className="liquid-glass rounded-[22px] px-6 py-8 grid gap-8 sm:grid-cols-[1fr_auto_auto]">
        <span className="self-center">{dict["footer.tagline"]}</span>

        <nav className="flex flex-col gap-2 sm:items-end">
          <span className="text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--navy-3)" }}>
            {dict["footer.productHeading"]}
          </span>
          <div className="flex items-center gap-5 flex-wrap sm:justify-end">
            <Link href="/listings" className="hover:text-navy">{dict["footer.browseHomes"]}</Link>
            <Link href="/dashboard" className="hover:text-navy">{dict["footer.account"]}</Link>
            <a href={marketingUrl("/how-it-works")} className="hover:text-navy">{dict["footer.howItWorks"]}</a>
            <a href={marketingUrl("/blog")} className="hover:text-navy">{dict["footer.blog"]}</a>
            <a href={marketingUrl("/pricing")} className="hover:text-navy">{dict["nav.pricing"]}</a>
          </div>
        </nav>

        <nav className="flex flex-col gap-2 sm:items-end">
          <span className="text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--navy-3)" }}>
            {dict["footer.legalHeading"]}
          </span>
          <div className="flex items-center gap-5 flex-wrap sm:justify-end">
            <a href={marketingUrl("/privacy")} className="hover:text-navy">{dict["footer.privacy"]}</a>
            <a href={marketingUrl("/terms")} className="hover:text-navy">{dict["footer.terms"]}</a>
          </div>
        </nav>
        </div>
      </div>
    </footer>
  );
}
