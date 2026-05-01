import Link from "next/link";
import { LogoMark } from "@/components/illustrations";
import { getSession } from "@/lib/auth/session";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/listings", label: "Homes" },
  { href: "/insurance", label: "Insurance" },
  { href: "/pricing", label: "Pricing" },
  { href: "/corporate", label: "Companies" },
];

export async function Navbar() {
  const session = await getSession();

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
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link href="/swaps" className="hidden sm:inline-flex nav-link">
                My swaps
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full bg-navy text-cream w-9 h-9 font-medium uppercase text-sm"
                style={{ background: "var(--navy)", color: "var(--cream)" }}
                aria-label="Dashboard"
              >
                {(session.name ?? session.email)[0].toUpperCase()}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline-flex nav-link">
                Sign in
              </Link>
              <Link href="/register" className="pill-primary">
                Join the beta
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
