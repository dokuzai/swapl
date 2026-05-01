import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { VerifiedBadge } from "@/components/listing/badges";

export const dynamic = "force-dynamic";

export default async function EditListingPage(props: PageProps<"/listings/[id]/edit">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit`);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  const featuredActive = listing.isFeatured && listing.featuredUntil && listing.featuredUntil > new Date();

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={`/listings/${id}`} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {listing.title}
          </Link>
          <p className="kicker mb-3">Manage listing</p>
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
                  {listing.isVerified ? "Verified" : "Get verified"}
                </h2>
              </div>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {listing.isVerified
                  ? "Your listing carries the verified badge across the site."
                  : "Submit a video walkthrough; once approved your listing surfaces above standard results."}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {listing.isVerified ? "View status →" : "Submit · €39 →"}
              </span>
            </Link>

            <Link
              href={`/listings/${id}/edit/featured`}
              className="surface-card p-6 block"
              style={featuredActive ? { background: "var(--pink-light)" } : undefined}
            >
              <h2 className="font-display text-xl tracking-[-0.01em] mb-2">
                {featuredActive ? "Featured" : "Feature this listing"}
              </h2>
              <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                {featuredActive
                  ? `Active until ${listing.featuredUntil!.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
                  : "Get to the top of browse for 14 or 30 days. Capped at 5 per city."}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                {featuredActive ? "Manage →" : "From €19 →"}
              </span>
            </Link>
          </div>

          <p className="text-sm" style={{ color: "var(--navy-2)" }}>
            Editing the listing fields is coming next — for now you can re-publish via{" "}
            <Link href="/listings/new" className="font-medium" style={{ color: "var(--pink)" }}>
              /listings/new
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
