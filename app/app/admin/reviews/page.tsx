// /admin/reviews — swap-review moderation queue (DOK-149). Lists every
// review newest-first with an optional status filter; hide/restore flips
// visibility on the public profile.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import ReviewActions from "./review-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews · admin" };

const FILTERS = ["all", "published", "hidden"] as const;
type Filter = (typeof FILTERS)[number];

export default async function AdminReviews({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();

  const { status } = await searchParams;
  const filter: Filter = FILTERS.includes(status as Filter) ? (status as Filter) : "all";

  const reviews = await prisma.swapReview.findMany({
    where: filter === "all" ? {} : { status: filter },
    include: {
      author: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Moderation</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Reviews</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          Hidden reviews disappear from the public profile and its rating aggregates.
        </p>
      </header>

      <nav className="mb-6 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/admin/reviews" : `/admin/reviews?status=${f}`}
            className="font-mono text-[11px] uppercase tracking-[.08em] px-3 py-1 rounded-full"
            style={
              filter === f
                ? { background: "var(--navy)", color: "var(--cream)" }
                : { background: "var(--cream-2)", color: "var(--navy-2)" }
            }
          >
            {f}
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
          No reviews{filter === "all" ? "" : ` with status “${filter}”`} yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="surface-card p-5">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm">
                    <Link href={`/profile/${r.author.id}`} className="font-medium hover:underline">
                      {r.author.name ?? r.author.email}
                    </Link>
                    <span style={{ color: "var(--navy-3)" }}> about </span>
                    <Link href={`/profile/${r.subject.id}`} className="font-medium hover:underline">
                      {r.subject.name ?? r.subject.email}
                    </Link>
                  </div>
                  <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)} · {r.createdAt.toISOString().slice(0, 10)}
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
                    {r.text}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                    style={
                      r.status === "published"
                        ? { background: "var(--pink)", color: "#fff" }
                        : { background: "var(--cream-2)", color: "var(--destructive)" }
                    }
                  >
                    {r.status}
                  </span>
                  <ReviewActions reviewId={r.id} status={r.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
