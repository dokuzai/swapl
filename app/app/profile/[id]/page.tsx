import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ListingCard } from "@/components/listing/listing-card";
import { toDTO } from "@/lib/listing-utils";
import { parseInterests, INTEREST_CATEGORIES } from "@/lib/interests";

export const dynamic = "force-dynamic";

export default async function ProfilePage(props: PageProps<"/profile/[id]">) {
  const { id } = await props.params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      listings: {
        where: { isActive: true },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) notFound();

  const interests = parseInterests(user.interests);
  const grouped = new Map<string, typeof interests>();
  for (const t of interests) {
    const arr = grouped.get(t.category) ?? [];
    arr.push(t);
    grouped.set(t.category, arr);
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14">
          <header className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="kicker mb-3">Member · joined {user.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
              <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
                {user.name ?? user.email.split("@")[0]}
              </h1>
              {user.bioVibe && (
                <p className="mt-3 max-w-2xl font-display italic text-[20px]" style={{ color: "var(--navy)" }}>
                  &ldquo;{user.bioVibe}&rdquo;
                </p>
              )}
              {user.bio && (
                <p className="mt-3 max-w-2xl text-[16px]" style={{ color: "var(--navy-2)" }}>
                  {user.bio}
                </p>
              )}
            </div>
            {user.verified && (
              <span className="self-start match-badge" style={{ background: "var(--navy)", color: "var(--cream)" }}>
                ID verified
              </span>
            )}
          </header>

          {interests.length > 0 && (
            <section className="mb-10">
              <p className="kicker mb-3">Interests</p>
              <div className="surface-card p-6 space-y-4">
                {INTEREST_CATEGORIES.map((cat) => {
                  const items = grouped.get(cat.id);
                  if (!items?.length) return null;
                  return (
                    <div key={cat.id}>
                      <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
                        {cat.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {items.map((t) => (
                          <span key={t.slug} className="tag-chip" style={{ background: "var(--pink-light)", color: "var(--navy)" }}>
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-display text-2xl tracking-[-0.01em] mb-4">
              {user.listings.length === 1 ? "Their home" : "Their homes"}
            </h2>
            {user.listings.length === 0 ? (
              <div className="surface-card p-10 text-center" style={{ color: "var(--navy-2)" }}>
                No active listings.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {user.listings.map((l) => (
                  <ListingCard key={l.id} listing={toDTO(l)} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-10">
            <Link href="/listings" className="pill-ghost">← Back to all listings</Link>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
