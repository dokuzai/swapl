import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insurance · admin" };

export default async function AdminInsurance() {
  await requireAdminPage();

  const [policies, totals] = await Promise.all([
    prisma.insurancePolicy.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        agreement: {
          include: {
            listing1: { select: { city: true } },
            listing2: { select: { city: true } },
          },
        },
      },
    }),
    prisma.insurancePolicy.aggregate({
      _sum: { premiumCents: true, platformShareCents: true },
      _count: { _all: true },
    }),
  ]);

  const byStatus = await prisma.insurancePolicy.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Underwriter</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Insurance</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          v1 ships against the swapl-cover mock. Switch INSURANCE_PROVIDER to flip to the real underwriter.
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <Stat label="Total policies" value={String(totals._count._all)} />
        <Stat label="Total premium" value={`€${((totals._sum.premiumCents ?? 0) / 100).toFixed(2)}`} />
        <Stat label="Platform share earned" value={`€${((totals._sum.platformShareCents ?? 0) / 100).toFixed(2)}`} accent />
      </div>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">By status</h2>
        <ul className="flex flex-wrap gap-3">
          {byStatus.map((s) => (
            <li key={s.status}
              className="font-mono text-[10px] uppercase tracking-[.08em] px-3 py-1.5 rounded-full"
              style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}>
              {s.status} · {s._count._all}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Recent policies</h2>
        <ul className="space-y-2 text-sm">
          {policies.map((p) => (
            <li key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 divider-dashed first:border-t-0 first:pt-0">
              <span className="flex flex-col">
                <span className="font-medium">
                  <Link href={`/swaps/${p.agreement.proposalId}`} className="hover:underline">
                    {p.policyNumber}
                  </Link>
                </span>
                <span className="text-xs" style={{ color: "var(--navy-3)" }}>
                  {p.agreement.listing1.city} ⇄ {p.agreement.listing2.city} · expires{" "}
                  {p.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </span>
              <span className="flex items-center gap-3 font-mono text-xs">
                <span
                  className="uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                  style={
                    p.status === "active"
                      ? { background: "var(--pink)", color: "#fff" }
                      : { background: "var(--cream-2)", color: "var(--navy-3)" }
                  }
                >
                  {p.status}
                </span>
                <span style={{ color: "var(--navy-2)" }}>
                  €{(p.premiumCents / 100).toFixed(2)} · share €{(p.platformShareCents / 100).toFixed(2)}
                </span>
              </span>
            </li>
          ))}
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
