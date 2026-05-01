import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { ListingCard } from "@/components/listing/listing-card";
import { AISuggestions } from "@/components/listing/ai-suggestions";
import { toDTO, formatDateRange } from "@/lib/listing-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · swapl" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [user, listings, incoming, outgoing, agreements] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.listing.findMany({
      where: { userId: session.userId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.swapProposal.count({
      where: { targetListing: { userId: session.userId }, status: { in: ["PENDING", "COUNTERED"] } },
    }),
    prisma.swapProposal.count({
      where: { proposerId: session.userId, status: { in: ["PENDING", "COUNTERED"] } },
    }),
    prisma.swapAgreement.count({
      where: {
        OR: [{ listing1: { userId: session.userId } }, { listing2: { userId: session.userId } }],
        status: "ACTIVE",
      },
    }),
  ]);

  return (
    <div className="wrap py-10 lg:py-14">
      <header className="mb-10">
        <p className="kicker mb-3">Hi {user?.name ?? user?.email.split("@")[0]} 👋</p>
        <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
          Your swap dashboard
        </h1>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        <Stat label="Waiting on you" value={incoming} href="/swaps" />
        <Stat label="Sent — awaiting reply" value={outgoing} href="/swaps" />
        <Stat label="Active swaps" value={agreements} href="/swaps" accent />
      </section>

      <section className="mb-12">
        <AISuggestions />
      </section>

      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl tracking-[-0.01em]">Your listings</h2>
          <Link href="/listings/new" className="pill-primary">+ List a new home</Link>
        </div>
        {listings.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <h3 className="font-display text-xl mb-2">No listings yet.</h3>
            <p className="mb-5" style={{ color: "var(--navy-2)" }}>
              You need to publish a home before you can propose swaps.
            </p>
            <Link href="/listings/new" className="pill-primary">List my home</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={toDTO(l)} hrefSuffix="/edit" />
            ))}
          </div>
        )}
      </section>

      <section className="surface-card p-6">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Account</h2>
        <p className="text-sm mb-2" style={{ color: "var(--navy-2)" }}>
          Signed in as <span className="font-medium">{session.email}</span>
        </p>
        <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
          Joined {user?.createdAt && formatDateRange(user.createdAt.toISOString(), user.createdAt.toISOString()).split(" – ")[0]}
        </p>
        <div className="flex gap-3">
          <Link href="/account" className="pill-ghost">Account settings</Link>
          <form action="/api/auth/logout" method="post">
            <button className="pill-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, href, accent }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      className="surface-card p-6 block"
      style={accent ? { background: "var(--pink-light)" } : undefined}
    >
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
        {label}
      </div>
      <div className="font-display text-4xl" style={{ color: accent ? "var(--pink)" : "var(--navy)" }}>
        {value}
      </div>
    </Link>
  );
}
