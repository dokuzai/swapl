import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Featured · admin" };

export default async function AdminFeatured() {
  await requireAdminPage();

  const now = new Date();
  const [active, recent] = await Promise.all([
    prisma.listing.findMany({
      where: { isFeatured: true, featuredUntil: { gt: now } },
      include: { user: { select: { email: true } } },
      orderBy: [{ city: "asc" }, { featuredUntil: "asc" }],
    }),
    prisma.listingFeaturedPurchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { listing: { select: { title: true, city: true } } },
    }),
  ]);

  const byCity = new Map<string, number>();
  for (const l of active) byCity.set(l.city, (byCity.get(l.city) ?? 0) + 1);

  const totalCents = recent.reduce((sum, r) => sum + r.amountCents, 0);

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Visibility</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Featured listings</h1>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <Stat label="Active boosts" value={String(active.length)} />
        <Stat label="Cities at cap (5/city)" value={String([...byCity.values()].filter((n) => n >= 5).length)} />
        <Stat label="Recent revenue (last 20 sales)" value={`€${(totalCents / 100).toFixed(2)}`} accent />
      </div>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Active boosts</h2>
        {active.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--navy-3)" }}>No active boosts.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {active.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                <Link href={`/listings/${l.id}`} className="font-medium hover:underline">{l.title}</Link>
                <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                  {l.city} · ends {l.featuredUntil!.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Recent purchases</h2>
        {recent.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--navy-3)" }}>No purchases yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                <span>
                  <span className="font-medium">{r.listing.title}</span>
                  <span className="ml-2 text-xs" style={{ color: "var(--navy-3)" }}>{r.listing.city}</span>
                </span>
                <span className="font-mono text-[11px]">
                  {r.durationDays}d · €{(r.amountCents / 100).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface-card p-5" style={accent ? { background: "var(--pink-light)" } : undefined}>
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>{label}</div>
      <div className="font-display text-3xl" style={{ color: accent ? "var(--pink)" : "var(--navy)" }}>{value}</div>
    </div>
  );
}
