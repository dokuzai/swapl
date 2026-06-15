import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import FeaturedForm from "./featured-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feature this listing · swapl" };

export default async function FeaturedPage(props: PageProps<"/listings/[id]/edit/featured">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit/featured`);
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { featuredPurchases: { orderBy: { endsAt: "desc" }, take: 5 } },
  });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const activeUntil = listing.featuredUntil && listing.featuredUntil > new Date() ? listing.featuredUntil : null;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={`/listings/${id}`} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {listing.title}
          </Link>
          <p className="kicker mb-3">{t("featured.kicker")}</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">{t("featured.title")}</h1>
          <p className="text-[16px] mb-8" style={{ color: "var(--navy-2)" }}>
            {t("featured.intro")}
          </p>

          {activeUntil && (
            <div className="surface-card p-5 mb-6" style={{ background: "var(--pink-light)" }}>
              <p className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--pink)" }}>{t("featured.activeUntil")}</p>
              <p className="font-display text-xl">{activeUntil.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })}</p>
            </div>
          )}

          <FeaturedForm listingId={id} />

          {listing.featuredPurchases.length > 0 && (
            <section className="surface-card p-6 mt-8">
              <h2 className="font-display text-xl tracking-[-0.01em] mb-4">{t("featured.pastPurchases")}</h2>
              <ul className="space-y-2 text-sm">
                {listing.featuredPurchases.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                    <span>{t("featured.boostLine", { days: p.durationDays, amount: (p.amountCents / 100).toFixed(2) })}</span>
                    <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                      {p.startsAt.toLocaleDateString(locale)} → {p.endsAt.toLocaleDateString(locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
