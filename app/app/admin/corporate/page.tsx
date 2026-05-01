import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Corporate · admin" };

export default async function AdminCorporate() {
  await requireAdminPage();
  const [leads, orgs] = await Promise.all([
    prisma.corporateLead.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.organization.findMany({ include: { _count: { select: { members: true } } }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">B2B</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Corporate</h1>
      </header>

      <section className="mb-12">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Active organisations</h2>
        {orgs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--navy-3)" }}>No paying companies yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                <span>
                  <span className="font-medium">{o.name}</span>
                  <span className="ml-2 text-xs" style={{ color: "var(--navy-3)" }}>{o.billingEmail}</span>
                </span>
                <span className="font-mono text-[11px]">
                  {o._count.members} / {o.seatCount} seats · {o.planStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Leads</h2>
        {leads.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--navy-3)" }}>No new leads.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {leads.map((l) => (
              <li key={l.id} className="surface-card p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-medium">{l.companyName}</span>
                    <span className="ml-2 text-xs" style={{ color: "var(--navy-3)" }}>
                      {l.contactName} · {l.email}
                    </span>
                  </div>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                    style={{ background: l.status === "new" ? "var(--pink-light)" : "var(--cream-2)", color: l.status === "new" ? "var(--pink)" : "var(--navy-3)" }}
                  >
                    {l.status}
                  </span>
                </div>
                {l.useCase && (
                  <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>{l.useCase}</p>
                )}
                <div className="mt-2 text-xs font-mono" style={{ color: "var(--navy-3)" }}>
                  {l.employeeCount ? `${l.employeeCount} employees · ` : ""}
                  {l.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
