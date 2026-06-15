import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { VerifiedBadge, OwnerVerifiedBadge } from "@/components/listing/badges";

export const dynamic = "force-dynamic";

export default async function EditListingPage(props: PageProps<"/listings/[id]/edit">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit`);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const featuredActive = listing.isFeatured && listing.featuredUntil && listing.featuredUntil > new Date();

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={`/listings/${id}`} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {listing.title}
          </Link>
          <p className="kicker mb-3">{t("manage.kicker")}</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-8">{listing.title}</h1>

          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <Link
              href={`/listings/${id}/edit/verify`}
              className="surface-card p-6 block"
              style={listing.isVerified ? { background: "var(--pink-light)" } : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                {listing.isVerified && <VerifiedBadge size={20} />}
                <h2 className="font-display text-xl tracking-[-0.01em]">
                  {listing.isVerified ? t("manage.verified") : t("manage.getVerified")}
                </h2>
              </div>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {listing.isVerified ? t("manage.verifiedBody") : t("manage.getVerifiedBody")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {listing.isVerified ? t("manage.viewStatus") : t("manage.submitVerify")}
              </span>
            </Link>

            <Link
              href={`/listings/${id}/edit/property-verification`}
              className="surface-card p-6 block"
              style={listing.ownerVerified ? { background: "var(--pink-light)" } : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                {listing.ownerVerified && <OwnerVerifiedBadge label={t("manage.ownerVerified")} />}
                <h2 className="font-display text-xl tracking-[-0.01em]" style={listing.ownerVerified ? undefined : { color: "var(--navy-2)" }}>
                  {listing.ownerVerified ? t("manage.ownerVerified") : t("manage.ownerVerifiedOptional")}
                </h2>
              </div>
              <p className="text-sm" style={{ color: listing.ownerVerified ? "var(--navy-2)" : "var(--navy-3)" }}>
                {listing.ownerVerified ? t("manage.ownerVerifiedBody") : t("manage.ownerVerifiedHint")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: listing.ownerVerified ? "var(--pink)" : "var(--navy-3)" }}>
                {listing.ownerVerified ? t("manage.viewStatus") : t("manage.addProof")}
              </span>
            </Link>

            <Link
              href={`/listings/${id}/edit/featured`}
              className="surface-card p-6 block"
              style={featuredActive ? { background: "var(--pink-light)" } : undefined}
            >
              <h2 className="font-display text-xl tracking-[-0.01em] mb-2">
                {featuredActive ? t("manage.featured") : t("manage.featureThis")}
              </h2>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {featuredActive
                  ? t("manage.featuredActiveUntil", {
                      date: listing.featuredUntil!.toLocaleDateString(locale, { month: "long", day: "numeric" }),
                    })
                  : t("manage.featuredBody")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {featuredActive ? t("manage.manage") : t("manage.fromPrice")}
              </span>
            </Link>

            <Link href={`/listings/${id}/edit/details`} className="surface-card p-6 block">
              <h2 className="font-display text-xl tracking-[-0.01em] mb-2">{t("manage.editDetails")}</h2>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {t("manage.editDetailsBody")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {t("manage.edit")}
              </span>
            </Link>

            <Link href={`/listings/${id}/edit/home-guide`} className="surface-card p-6 block">
              <h2 className="font-display text-xl tracking-[-0.01em] mb-2">{t("manage.homeGuide")}</h2>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {t("manage.homeGuideBody")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {t("manage.writeGuide")}
              </span>
            </Link>

            <Link href={`/listings/${id}/edit/calendar`} className="surface-card p-6 block">
              <h2 className="font-display text-xl tracking-[-0.01em] mb-2">{t("manage.availability")}</h2>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {t("manage.availabilityBody")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {t("manage.manageCalendar")}
              </span>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
