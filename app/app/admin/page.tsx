import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { EmailTestButton } from "@/components/admin/email-test-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · swapl" };

export default async function AdminOverview() {
  const me = await requireAdminPage();
  const [users, listings, agreements, policies, beta, freeSubs, plusSubs, proSubs, leads] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.swapAgreement.count({ where: { status: "ACTIVE" } }),
    prisma.insurancePolicy.count({ where: { status: "active" } }),
    prisma.betaSignup.count(),
    prisma.user.count({ where: { subscription: null } }),
    prisma.subscription.count({ where: { planId: "plus", status: "active" } }),
    prisma.subscription.count({ where: { planId: "pro", status: "active" } }),
    prisma.corporateLead.count({ where: { status: "new" } }),
  ]);

  const cards = [
    { label: "Active listings", value: listings },
    { label: "Active swap agreements", value: agreements },
    { label: "Active insurance policies", value: policies },
    { label: "Members on Free", value: freeSubs },
    { label: "Members on Plus", value: plusSubs, accent: true },
    { label: "Members on Pro", value: proSubs, accent: true },
    { label: "Total users", value: users },
    { label: "Beta signups", value: beta },
    { label: "New corporate leads", value: leads, accent: true },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Overview</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Operations</h1>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="surface-card p-5" style={c.accent ? { background: "var(--pink-light)" } : undefined}>
            <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
              {c.label}
            </div>
            <div className="font-display text-3xl" style={{ color: c.accent ? "var(--pink)" : "var(--navy)" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <p className="kicker mb-3">Email transport check</p>
        <EmailTestButton defaultEmail={me.email} />
        <p className="mt-2 text-xs" style={{ color: "var(--navy-3)" }}>
          Sends a real email via Resend if RESEND_API_KEY is configured; otherwise logs to the
          server console. The reply tells you which path ran.
        </p>
      </section>
    </>
  );
}
