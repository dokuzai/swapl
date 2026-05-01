import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="mt-auto border-t border-line py-10 font-mono text-[13px] text-navy-3"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="wrap flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span>© 2026 swapl · keys for keys, no money</span>
        <nav className="flex items-center gap-6 flex-wrap">
          <Link href="/how-it-works" className="hover:text-navy">How it works</Link>
          <Link href="/insurance" className="hover:text-navy">Insurance</Link>
          <Link href="/listings" className="hover:text-navy">Browse homes</Link>
          <Link href="/dashboard" className="hover:text-navy">Account</Link>
        </nav>
      </div>
    </footer>
  );
}
