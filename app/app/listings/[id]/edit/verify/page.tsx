import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getI18n, t as tt, type Dict } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import VerifyForm from "./verify-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get verified · swapl" };

export default async function VerifyPage(props: PageProps<"/listings/[id]/edit/verify">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit/verify`);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={`/listings/${id}`} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {listing.title}
          </Link>
          <p className="kicker mb-3">{t("verifyListing.kicker")}</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">{t("verifyListing.title")}</h1>
          <p className="text-[16px] mb-8" style={{ color: "var(--navy-2)" }}>
            {t("verifyListing.intro")}
          </p>

          <div className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">{t("verifyListing.status")}</h2>
            <StatusPill status={listing.verificationStatus} dict={dict} />
            {listing.verificationStatus === "approved" && (
              <p className="mt-3 text-sm" style={{ color: "var(--navy-2)" }}>
                {t("verifyListing.approvedNote")}
              </p>
            )}
            {listing.verificationStatus === "rejected" && (
              <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
                {t("verifyListing.rejectedNote")}
              </p>
            )}
            {listing.verificationStatus === "pending" && (
              <p className="mt-3 text-sm" style={{ color: "var(--navy-2)" }}>
                {t("verifyListing.pendingNote", {
                  date:
                    listing.verificationSubmittedAt?.toLocaleDateString(locale, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }) ?? "",
                })}
              </p>
            )}
          </div>

          {(listing.verificationStatus === "none" || listing.verificationStatus === "rejected") && (
            <VerifyForm listingId={id} />
          )}

          <p className="mt-8 text-xs" style={{ color: "var(--navy-3)" }}>
            {t("verifyListing.terms")}
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

function StatusPill({ status, dict }: { status: string; dict: Dict }) {
  const t = (key: DictKey) => tt(dict, key);
  const map: Record<string, { labelKey: DictKey; bg: string; fg: string }> = {
    none: { labelKey: "verifyListing.statusNone", bg: "var(--cream-2)", fg: "var(--navy-3)" },
    pending: { labelKey: "verifyListing.statusPending", bg: "var(--pink-light)", fg: "var(--pink)" },
    approved: { labelKey: "verifyListing.statusApproved", bg: "var(--pink)", fg: "#fff" },
    rejected: { labelKey: "verifyListing.statusRejected", bg: "var(--cream-2)", fg: "var(--destructive)" },
  };
  const s = map[status] ?? map.none;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full inline-block"
      style={{ background: s.bg, color: s.fg }}
    >
      {t(s.labelKey)}
    </span>
  );
}
