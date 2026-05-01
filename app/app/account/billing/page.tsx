import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEffectivePlan } from "@/lib/billing/limits";
import { ManageBillingButton } from "@/components/billing/manage-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing · swapl" };

export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/billing");

  const [plan, sub, invoices] = await Promise.all([
    getEffectivePlan(session.userId),
    prisma.subscription.findUnique({ where: { userId: session.userId } }),
    prisma.billingInvoice.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href="/account" className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← Account
          </Link>
          <p className="kicker mb-3">Billing</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-8">Your plan</h1>

          <section className="surface-card p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                  Current plan
                </div>
                <h2 className="font-display text-2xl tracking-[-0.01em]">{plan.label}</h2>
              </div>
              {plan.id === "free" ? (
                <Link href="/pricing" className="pill-primary">Upgrade</Link>
              ) : (
                <ManageBillingButton />
              )}
            </div>

            {sub && (
              <div className="mt-5 pt-5 divider-dashed grid grid-cols-2 gap-3 text-sm">
                <Stat label="Status" value={sub.status} />
                <Stat label="Renews" value={sub.cancelAtPeriodEnd ? "Cancels" : "Renews on"} />
                <Stat label="Period start" value={sub.currentPeriodStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
                <Stat label="Period end" value={sub.currentPeriodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
              </div>
            )}
          </section>

          <section className="surface-card p-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Invoices</h2>
            {invoices.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>No invoices yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                        {inv.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      <div className="text-sm">€{(inv.amountCents / 100).toFixed(2)} · {inv.status}</div>
                    </div>
                    {inv.pdfUrl && (
                      <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                        Receipt PDF →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-0.5" style={{ color: "var(--navy-3)" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
