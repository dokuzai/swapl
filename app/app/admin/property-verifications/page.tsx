import Link from "next/link";
import { prisma, parseJSON } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { getDictionary, t } from "@/lib/i18n/server";
import PropertyVerificationActions from "./property-verification-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner verification · admin" };

type Doc = { url: string; label: string };

export default async function AdminPropertyVerifications() {
  await requireAdminPage();
  const dict = await getDictionary();

  // Queue = anything awaiting a human: open "pending" requests PLUS any request
  // whose listing the AI auto-flagged ineligible (business_property, DOK-186) and
  // an admin has not yet reversed. The override route accepts rejected rows too.
  const pending = await prisma.propertyVerification.findMany({
    where: {
      OR: [{ status: "pending" }, { listing: { ineligibleReason: { not: null } } }],
    },
    orderBy: { createdAt: "asc" },
    include: {
      listing: { select: { id: true, title: true, city: true, neighbourhood: true, ineligibleReason: true } },
      user: { select: { name: true, email: true } },
    },
  });

  const recent = await prisma.propertyVerification.findMany({
    where: { status: { in: ["approved", "rejected"] } },
    orderBy: { updatedAt: "desc" },
    take: 12,
    include: {
      listing: { select: { id: true, title: true } },
      user: { select: { email: true } },
    },
  });

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">{t(dict, "admin.propVerif.kicker")}</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">{t(dict, "admin.propVerif.title")}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          {t(dict, "admin.propVerif.subtitle")}
        </p>
      </header>

      <section className="mb-12">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">
          {t(dict, "admin.propVerif.pending", { count: pending.length })}
        </h2>
        {pending.length === 0 ? (
          <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
            {t(dict, "admin.propVerif.empty")}
          </div>
        ) : (
          <ul className="space-y-4">
            {pending.map((v) => {
              const docs = parseJSON<Doc[]>(v.documents, []);
              const aiReasons = parseJSON<string[]>(v.aiReasons, []);
              return (
                <li key={v.id} className="surface-card p-5">
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-display text-lg">
                        <Link href={`/listings/${v.listing.id}`} className="hover:underline">
                          {v.listing.title}
                        </Link>
                      </div>
                      <div className="text-sm" style={{ color: "var(--navy-3)" }}>
                        {v.listing.neighbourhood} · {v.listing.city} · {v.user?.name ?? v.user?.email}
                      </div>

                      {/* AI proposal (DOK-186) — advisory only; the admin confirms or overrides. */}
                      {(v.aiClassification || v.listing.ineligibleReason) && (
                        <div className="mt-3 rounded-lg p-3" style={{ background: "var(--cream-2)" }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                              {t(dict, "admin.propVerif.aiProposal")}
                            </span>
                            {v.aiClassification && (
                              <span
                                className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                                style={
                                  v.aiClassification === "business"
                                    ? { background: "#dc2626", color: "#fff" }
                                    : v.aiClassification === "private_owner"
                                      ? { background: "var(--pink)", color: "#fff" }
                                      : { background: "var(--card-bg)", color: "var(--navy-2)" }
                                }
                              >
                                {v.aiClassification}
                                {typeof v.aiConfidence === "number"
                                  ? ` · ${Math.round(v.aiConfidence * 100)}%`
                                  : ""}
                              </span>
                            )}
                            {v.aiEntityType && (
                              <span className="text-xs" style={{ color: "var(--navy-3)" }}>
                                {v.aiEntityType}
                              </span>
                            )}
                            {v.documentType && (
                              <span className="text-xs" style={{ color: "var(--navy-3)" }}>
                                · {v.documentType}
                              </span>
                            )}
                            {v.listing.ineligibleReason && (
                              <span
                                className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                                style={{ background: "#dc2626", color: "#fff" }}
                              >
                                {t(dict, "admin.propVerif.ineligible")}: {v.listing.ineligibleReason}
                              </span>
                            )}
                          </div>
                          {aiReasons.length > 0 && (
                            <ul className="mt-2 space-y-0.5 text-xs" style={{ color: "var(--navy-2)" }}>
                              {aiReasons.map((r, i) => (
                                <li key={i}>· {r}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <div className="mt-3">
                        <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
                          {t(dict, "admin.propVerif.documents")}
                        </div>
                        <ul className="space-y-1">
                          {docs.map((d, i) => (
                            <li key={i}>
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[11px] hover:underline"
                                style={{ color: "var(--pink)" }}
                              >
                                {d.label} →
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <PropertyVerificationActions
                      id={v.id}
                      notePlaceholder={t(dict, "admin.propVerif.notePlaceholder")}
                      approveLabel={t(dict, "admin.propVerif.approve")}
                      rejectLabel={t(dict, "admin.propVerif.reject")}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">{t(dict, "admin.propVerif.recent")}</h2>
        {recent.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--navy-3)" }}>{t(dict, "admin.propVerif.recentEmpty")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                <span>
                  <Link href={`/listings/${v.listing.id}`} className="font-medium hover:underline">
                    {v.listing.title}
                  </Link>
                  <span className="ml-2 text-xs" style={{ color: "var(--navy-3)" }}>{v.user?.email}</span>
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                  style={
                    v.status === "approved"
                      ? { background: "var(--pink)", color: "#fff" }
                      : { background: "var(--cream-2)", color: "#dc2626" }
                  }
                >
                  {v.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
