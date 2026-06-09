import Link from "next/link";
import { appUrl } from "@/lib/app-url";
import { getDictionary } from "@/lib/i18n/server";

export async function Footer() {
  const dict = await getDictionary();
  return (
    <footer
      className="mt-auto border-t border-line py-10 font-mono text-[13px] text-navy-3"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="wrap grid gap-8 sm:grid-cols-[1fr_auto_auto]">
        <span className="self-center">{dict["footer.tagline"]}</span>

        <nav className="flex flex-col gap-2 sm:items-end">
          <span className="text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--navy-3)" }}>
            {dict["footer.productHeading"]}
          </span>
          <div className="flex items-center gap-5 flex-wrap sm:justify-end">
            <Link href="/how-it-works" className="hover:text-navy">{dict["footer.howItWorks"]}</Link>
            <Link href="/insurance" className="hover:text-navy">{dict["footer.insurance"]}</Link>
            <Link href={appUrl("/listings")} className="hover:text-navy">{dict["footer.browseHomes"]}</Link>
            <Link href="/blog" className="hover:text-navy">{dict["footer.blog"]}</Link>
            <Link href={appUrl("/dashboard")} className="hover:text-navy">{dict["footer.account"]}</Link>
          </div>
        </nav>

        <nav className="flex flex-col gap-2 sm:items-end">
          <span className="text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--navy-3)" }}>
            {dict["footer.legalHeading"]}
          </span>
          <div className="flex items-center gap-5 flex-wrap sm:justify-end">
            <Link href="/privacy" className="hover:text-navy">{dict["footer.privacy"]}</Link>
            <Link href="/terms" className="hover:text-navy">{dict["footer.terms"]}</Link>
            <Link href="/contact" className="hover:text-navy">{dict["footer.contact"]}</Link>
          </div>
        </nav>
      </div>
    </footer>
  );
}
