import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/abilities";
import { getAdminMetrics } from "@/lib/admin/metrics";
import { AdminTable } from "@/components/admin/data-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Metrics · admin" };

const PROPOSAL_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "COUNTERED", "WITHDRAWN"] as const;

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function Card({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="surface-card p-5" style={accent ? { background: "var(--pink-light)" } : undefined}>
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
        {label}
      </div>
      <div className="font-display text-3xl" style={{ color: accent ? "var(--pink)" : "var(--navy)" }}>
        {value}
      </div>
      {sub ? (
        <div className="font-mono text-[11px] mt-1" style={{ color: "var(--navy-3)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminMetrics() {
  await requireAdminPage();
  const m = await getAdminMetrics();

  const nowCards = [
    { label: "Online now (15 min)", value: m.now.online, accent: true },
    { label: "Active today (DAU)", value: m.now.dau },
    { label: "Active 7 days (WAU)", value: m.now.wau },
    { label: "Active 30 days (MAU)", value: m.now.mau },
  ];

  const userCards = [
    { label: "Total users", value: m.users.total, accent: true },
    { label: "Email verified", value: m.users.emailVerified, sub: pct(m.users.total ? m.users.emailVerified / m.users.total : 0) },
    { label: "With ≥1 active listing", value: m.users.withActiveListing, sub: pct(m.users.total ? m.users.withActiveListing / m.users.total : 0) },
    { label: "New (7 days)", value: m.users.new7d },
    { label: "New (30 days)", value: m.users.new30d },
  ];

  const d = m.listingsPerUser.distribution;
  const distCards = [
    { label: "0 listings", value: d.zero },
    { label: "1 listing", value: d.one },
    { label: "2 listings", value: d.two },
    { label: "3+ listings", value: d.threePlus },
    {
      label: "Avg per host",
      value: m.listingsPerUser.avgPerUserWithListing.toFixed(2),
      sub: "listings per user with ≥1",
      accent: true,
    },
  ];

  const e = m.engagement;
  const engagementCards = [
    { label: "Proposals (total)", value: e.proposalsTotal },
    { label: "Proposal → accepted", value: pct(e.proposalAcceptRate), accent: true },
    { label: "Agreements active", value: e.agreementsActive },
    { label: "Agreements completed", value: e.agreementsCompleted },
    { label: "Messages (total)", value: e.messagesTotal },
    { label: "Messages (7 days)", value: e.messages7d },
    { label: "Favorites (total)", value: e.favoritesTotal },
    { label: "Favorites (7 days)", value: e.favorites7d },
    { label: "Saved searches", value: e.savedSearches },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Metrics</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Growth &amp; engagement</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          Activity windows are based on each user&apos;s last authenticated request (updated at most every 5 minutes).
        </p>
      </header>

      <section>
        <p className="kicker mb-3">Now</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {nowCards.map((c) => <Card key={c.label} {...c} />)}
        </div>
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Users</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {userCards.map((c) => <Card key={c.label} {...c} />)}
        </div>
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Listings per user</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {distCards.map((c) => <Card key={c.label} {...c} />)}
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between mb-3">
            <p className="kicker">Top hosts by listings</p>
            <Link href="/admin/users" className="font-mono text-[11px]" style={{ color: "var(--pink)" }}>
              All users →
            </Link>
          </div>
          <AdminTable
            headers={["Name", "Email", "Listings"]}
            emptyLabel="No listings yet."
            rows={m.listingsPerUser.topUsers.map((u) => [
              <span key="n" className="font-medium">{u.name ?? "—"}</span>,
              <span key="e" style={{ color: "var(--navy-3)" }}>{u.email}</span>,
              <span key="l" className="font-mono">{u.listings}</span>,
            ])}
          />
        </div>
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Active listings by city</p>
        <p className="mb-3 text-sm" style={{ color: "var(--navy-2)" }}>
          Top 15 of {m.cities.totalActiveListings} active listings — corridor liquidity at a glance.
        </p>
        <AdminTable
          headers={["City", "Active listings", "Share"]}
          emptyLabel="No active listings yet."
          rows={m.cities.top.map((c) => [
            <span key="c" className="font-medium">{c.city}</span>,
            <span key="n" className="font-mono">{c.listings}</span>,
            <span key="s" className="font-mono text-[11px]" style={{ color: "var(--pink)" }}>{pct(c.share)}</span>,
          ])}
        />
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Proposals by status</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {PROPOSAL_STATUSES.map((s) => (
            <Card key={s} label={s.toLowerCase()} value={e.proposalsByStatus[s] ?? 0} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Engagement</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {engagementCards.map((c) => <Card key={c.label} {...c} />)}
        </div>
      </section>
    </>
  );
}
