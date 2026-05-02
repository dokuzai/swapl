import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";

export async function Footer() {
  const dict = await getDictionary();
  return (
    <footer
      className="mt-auto border-t border-line py-10 font-mono text-[13px] text-navy-3"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="wrap flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span>{dict["footer.tagline"]}</span>
        <nav className="flex items-center gap-6 flex-wrap">
          <Link href="/how-it-works" className="hover:text-navy">{dict["footer.howItWorks"]}</Link>
          <Link href="/insurance" className="hover:text-navy">{dict["footer.insurance"]}</Link>
          <Link href="/listings" className="hover:text-navy">{dict["footer.browseHomes"]}</Link>
          <Link href="/dashboard" className="hover:text-navy">{dict["footer.account"]}</Link>
        </nav>
      </div>
    </footer>
  );
}
