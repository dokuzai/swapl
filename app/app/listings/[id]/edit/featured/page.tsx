import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
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

  const activeUntil = listing.featuredUntil && listing.featuredUntil > new Date() ? listing.featuredUntil : null;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={`/listings/${id}`} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {listing.title}
          </Link>
          <p className="kicker mb-3">Featured placement</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">Get to the top of browse.</h1>
          <p className="text-[16px] mb-8" style={{ color: "var(--navy-2)" }}>
            Show your listing in the Featured band above standard results. Capped at 5 per city —
            if your city is full, your slot starts as soon as one opens up.
          </p>

          {activeUntil && (
            <div className="surface-card p-5 mb-6" style={{ background: "var(--pink-light)" }}>
              <p className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--pink)" }}>Active until</p>
              <p className="font-display text-xl">{activeUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            </div>
          )}

          <FeaturedForm listingId={id} />

          {listing.featuredPurchases.length > 0 && (
            <section className="surface-card p-6 mt-8">
              <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Past purchases</h2>
              <ul className="space-y-2 text-sm">
                {listing.featuredPurchases.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                    <span>{p.durationDays}-day boost · €{(p.amountCents / 100).toFixed(2)}</span>
                    <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                      {p.startsAt.toLocaleDateString()} → {p.endsAt.toLocaleDateString()}
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
