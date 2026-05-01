import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import VerificationActions from "./verification-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verifications · admin" };

export default async function AdminVerifications() {
  await requireAdminPage();

  const pending = await prisma.listing.findMany({
    where: { verificationStatus: "pending" },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { verificationSubmittedAt: "asc" },
  });
  const recent = await prisma.listing.findMany({
    where: { verificationStatus: { in: ["approved", "rejected"] } },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { verificationReviewedAt: "desc" },
    take: 12,
  });

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Queue</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Verifications</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          Reviewing within 48 h is the contract — approve or reject below.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Pending — {pending.length}</h2>
        {pending.length === 0 ? (
          <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
            Inbox zero. Nothing waiting on review.
          </div>
        ) : (
          <ul className="space-y-4">
            {pending.map((l) => (
              <li key={l.id} className="surface-card p-5">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
                  <div>
                    <div className="font-display text-lg">
                      <Link href={`/listings/${l.id}`} className="hover:underline">{l.title}</Link>
                    </div>
                    <div className="text-sm" style={{ color: "var(--navy-3)" }}>
                      {l.neighbourhood} · {l.city} · {l.user?.name ?? l.user?.email}
                    </div>
                    {l.verificationVideoUrl && (
                      <a
                        href={l.verificationVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block font-mono text-[11px]"
                        style={{ color: "var(--pink)" }}
                      >
                        Open walkthrough →
                      </a>
                    )}
                  </div>
                  <VerificationActions listingId={l.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl tracking-[-0.01em] mb-4">Recently reviewed</h2>
        {recent.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--navy-3)" }}>Nothing yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 divider-dashed first:border-t-0 first:pt-0">
                <span>
                  <Link href={`/listings/${l.id}`} className="font-medium hover:underline">{l.title}</Link>
                  <span className="ml-2 text-xs" style={{ color: "var(--navy-3)" }}>{l.user?.email}</span>
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                  style={
                    l.verificationStatus === "approved"
                      ? { background: "var(--pink)", color: "#fff" }
                      : { background: "var(--cream-2)", color: "#dc2626" }
                  }
                >
                  {l.verificationStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
