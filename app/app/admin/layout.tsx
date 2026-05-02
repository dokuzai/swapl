import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { requireAdminPage } from "@/lib/auth/abilities";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/admin",                  label: "Overview" },
  { href: "/admin/insurance",        label: "Insurance" },
  { href: "/admin/verifications",    label: "Verifications" },
  { href: "/admin/featured",         label: "Featured" },
  { href: "/admin/affiliates",       label: "Affiliates" },
  { href: "/admin/corporate",        label: "Corporate leads" },
  { href: "/admin/revenue",          label: "Revenue" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminPage();
  return (
    <I18nProviderShell>
      <header
        className="sticky top-0 z-50 border-b backdrop-blur"
        style={{ background: "color-mix(in oklab, var(--navy) 92%, transparent)", color: "var(--cream)", borderColor: "color-mix(in oklab, var(--cream) 12%, transparent)" }}
      >
        <div className="wrap flex items-center justify-between py-3">
          <Link href="/admin" className="font-display text-lg tracking-[-0.01em] flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[.12em] px-2 py-0.5 rounded-full"
              style={{ background: "var(--pink)", color: "#fff" }}>admin</span>
            swapl<span style={{ color: "var(--pink)" }}>.</span>
          </Link>
          <span className="font-mono text-[11px]" style={{ color: "color-mix(in oklab, var(--cream) 70%, transparent)" }}>
            {me.email}
          </span>
        </div>
      </header>
      <main className="flex-1">
        <div className="wrap py-8 grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="lg:sticky lg:top-20 self-start">
            <ol className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="block px-3 py-2 rounded-lg text-sm transition-colors hover:bg-cream-2"
                    style={{ color: "var(--navy-2)" }}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
          <section>{children}</section>
        </div>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
