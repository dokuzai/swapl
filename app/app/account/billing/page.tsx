import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEffectivePlan } from "@/lib/billing/limits";
import { ManageBillingButton } from "@/components/billing/manage-button";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { marketingUrl } from "@/lib/marketing/urls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing · swapl" };

export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/billing");

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const [plan, sub, invoices] = await Promise.all([
    getEffectivePlan(session.userId),
    prisma.subscription.findUnique({ where: { userId: session.userId } }),
    prisma.billingInvoice.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href="/account" className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {t("billing.back")}
          </Link>
          <p className="kicker mb-3">{t("billing.kicker")}</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-8">{t("billing.title")}</h1>

          <section className="surface-card p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                  {t("billing.currentPlan")}
                </div>
                <h2 className="font-display text-2xl tracking-[-0.01em]">{plan.label}</h2>
              </div>
              {plan.id === "free" ? (
                <a href={marketingUrl("/pricing")} className="pill-primary">{t("billing.upgrade")}</a>
              ) : (
                <ManageBillingButton />
              )}
            </div>

            {sub && (
              <div className="mt-5 pt-5 divider-dashed grid grid-cols-2 gap-3 text-sm">
                <Stat label={t("billing.status")} value={sub.status} />
                <Stat label={t("billing.renews")} value={sub.cancelAtPeriodEnd ? t("billing.cancels") : t("billing.renewsOn")} />
                <Stat label={t("billing.periodStart")} value={sub.currentPeriodStart.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })} />
                <Stat label={t("billing.periodEnd")} value={sub.currentPeriodEnd.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })} />
              </div>
            )}
          </section>

          <section className="surface-card p-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-4">{t("billing.invoices")}</h2>
            {invoices.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("billing.noInvoices")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                        {inv.createdAt.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      <div className="text-sm">€{(inv.amountCents / 100).toFixed(2)} · {inv.status}</div>
                    </div>
                    {inv.pdfUrl && (
                      <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                        {t("billing.receiptPdf")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        </I18nProviderShell>
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
