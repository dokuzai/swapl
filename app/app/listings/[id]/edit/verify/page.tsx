import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
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

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={`/listings/${id}`} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {listing.title}
          </Link>
          <p className="kicker mb-3">Verification</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">Get the verified badge.</h1>
          <p className="text-[16px] mb-8" style={{ color: "var(--navy-2)" }}>
            One-time €39. Submit a 60-second walkthrough video (Loom link works), our team reviews
            within 48 hours. On approval the listing surfaces above standard results and shows the
            verified badge across browse, detail and your profile.
          </p>

          <div className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Status</h2>
            <StatusPill status={listing.verificationStatus} />
            {listing.verificationStatus === "approved" && (
              <p className="mt-3 text-sm" style={{ color: "var(--navy-2)" }}>
                You&rsquo;re verified. The badge is live on this listing.
              </p>
            )}
            {listing.verificationStatus === "rejected" && (
              <p className="mt-3 text-sm" style={{ color: "#dc2626" }}>
                Your previous submission was rejected — you can re-submit below.
              </p>
            )}
            {listing.verificationStatus === "pending" && (
              <p className="mt-3 text-sm" style={{ color: "var(--navy-2)" }}>
                Submitted on {listing.verificationSubmittedAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Reviews finish within 48 hours.
              </p>
            )}
          </div>

          {(listing.verificationStatus === "none" || listing.verificationStatus === "rejected") && (
            <VerifyForm listingId={id} />
          )}

          <p className="mt-8 text-xs" style={{ color: "var(--navy-3)" }}>
            By submitting you agree to swapl&rsquo;s verification terms — videos are stored securely
            for 90 days and never shared with other users.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    none: { label: "Not submitted", bg: "var(--cream-2)", fg: "var(--navy-3)" },
    pending: { label: "In review", bg: "var(--pink-light)", fg: "var(--pink)" },
    approved: { label: "Verified", bg: "var(--pink)", fg: "#fff" },
    rejected: { label: "Rejected", bg: "var(--cream-2)", fg: "#dc2626" },
  };
  const s = map[status] ?? map.none;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full inline-block"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
