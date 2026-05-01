import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliates · admin" };

export default async function AdminAffiliates() {
  await requireAdminPage();

  const [byPartner, byCity, recent, totals] = await Promise.all([
    prisma.affiliateClick.groupBy({
      by: ["partnerSlug"],
      _count: { _all: true },
    }),
    prisma.affiliateClick.groupBy({
      by: ["destinationCity"],
      _count: { _all: true },
      orderBy: { _count: { destinationCity: "desc" } },
      take: 12,
    }),
    prisma.affiliateClick.findMany({
      orderBy: { clickedAt: "desc" },
      take: 25,
    }),
    prisma.affiliateClick.aggregate({ _count: { _all: true } }),
  ]);

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Travel partners</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Affiliates</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          Click attribution lives here; revenue figures are pulled monthly from each partner's
          dashboard (CPA, rev-share, % booking) and entered manually for now.
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <Stat label="Total clicks" value={String(totals._count._all)} />
        <Stat label="Unique partners with traffic" value={String(byPartner.length)} />
        <Stat label="Top destination" value={byCity[0]?.destinationCity ?? "—"} accent />
      </div>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Clicks by partner</h2>
        <ul className="space-y-2 text-sm">
          {byPartner.map((row) => (
            <li key={row.partnerSlug} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
              <span className="font-medium">{row.partnerSlug}</span>
              <span className="font-mono text-xs">{row._count._all}</span>
            </li>
          ))}
          {byPartner.length === 0 && <li className="text-sm" style={{ color: "var(--navy-3)" }}>No clicks yet.</li>}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Top destinations</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {byCity.map((row) => (
            <li key={row.destinationCity ?? "—"} className="flex items-center justify-between px-3 py-1.5 rounded-full"
              style={{ background: "var(--cream-2)" }}>
              <span>{row.destinationCity ?? "(unknown)"}</span>
              <span className="font-mono text-[11px]">{row._count._all}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Recent clicks</h2>
        <ul className="space-y-1 text-sm">
          {recent.map((c) => (
            <li key={c.id} className="grid grid-cols-[110px_1fr_auto] gap-3 py-1.5 divider-dashed first:border-t-0 first:pt-0">
              <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                {c.clickedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })}
              </span>
              <span>
                <span className="font-medium">{c.partnerSlug}</span>
                {c.destinationCity && <span className="ml-2" style={{ color: "var(--navy-3)" }}>· {c.destinationCity}</span>}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                {c.userId ? "auth" : "anon"}
              </span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-sm" style={{ color: "var(--navy-3)" }}>No clicks yet.</li>}
        </ul>
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
