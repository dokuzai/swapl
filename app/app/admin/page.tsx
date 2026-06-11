import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { EmailTestButton } from "@/components/admin/email-test-button";
import { StatusPill, fmtDate } from "@/components/admin/data-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · swapl" };

const PROPOSAL_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "COUNTERED", "WITHDRAWN"] as const;

export default async function AdminOverview() {
  const me = await requireAdminPage();
  const [
    users,
    usersEmailVerified,
    listingsTotal,
    listingsActive,
    listingsVerified,
    agreements,
    policies,
    beta,
    freeSubs,
    plusSubs,
    proSubs,
    leads,
    proposalsByStatus,
    recentSignups,
    recentListings,
    waitlistInvited,
    waitlistRegistered,
    waitlistPublished,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.listing.count(),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.listing.count({ where: { isVerified: true } }),
    prisma.swapAgreement.count({ where: { status: "ACTIVE" } }),
    prisma.insurancePolicy.count({ where: { status: "active" } }),
    prisma.betaSignup.count(),
    prisma.user.count({ where: { subscription: null } }),
    prisma.subscription.count({ where: { planId: "plus", status: "active" } }),
    prisma.subscription.count({ where: { planId: "pro", status: "active" } }),
    prisma.corporateLead.count({ where: { status: "new" } }),
    prisma.swapProposal.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.betaSignup.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.listing.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { email: true } } },
    }),
    prisma.betaSignup.count({ where: { invitedAt: { not: null } } }),
    prisma.betaSignup.count({ where: { userId: { not: null } } }),
    prisma.user.count({ where: { betaSignup: { isNot: null }, listings: { some: {} } } }),
  ]);

  const proposalCount = new Map(proposalsByStatus.map((p) => [p.status, p._count._all]));

  const pct = (n: number, of: number) => (of === 0 ? "—" : `${Math.round((n / of) * 100)}%`);
  const funnel = [
    { label: "Waitlist", value: beta, share: pct(beta, beta) },
    { label: "Invited", value: waitlistInvited, share: pct(waitlistInvited, beta) },
    { label: "Registered", value: waitlistRegistered, share: pct(waitlistRegistered, beta) },
    { label: "Published a listing", value: waitlistPublished, share: pct(waitlistPublished, beta) },
  ];

  const cards = [
    { label: "Beta signups", value: beta, accent: true },
    { label: "Total users", value: users },
    { label: "Email-verified users", value: usersEmailVerified },
    { label: "Listings (total)", value: listingsTotal },
    { label: "Listings (active)", value: listingsActive },
    { label: "Listings (verified)", value: listingsVerified },
    { label: "Active swap agreements", value: agreements },
    { label: "Active insurance policies", value: policies },
    { label: "Members on Free", value: freeSubs },
    { label: "Members on Plus", value: plusSubs, accent: true },
    { label: "Members on Pro", value: proSubs, accent: true },
    { label: "New corporate leads", value: leads, accent: true },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Overview</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Operations</h1>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="surface-card p-5" style={c.accent ? { background: "var(--pink-light)" } : undefined}>
            <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
              {c.label}
            </div>
            <div className="font-display text-3xl" style={{ color: c.accent ? "var(--pink)" : "var(--navy)" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <p className="kicker mb-3">Waitlist funnel</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {funnel.map((f) => (
            <div key={f.label} className="surface-card p-4">
              <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                {f.label}
              </div>
              <div className="font-display text-2xl">{f.value}</div>
              <div className="font-mono text-[11px] mt-1" style={{ color: "var(--pink)" }}>
                {f.share}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Proposals by status</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {PROPOSAL_STATUSES.map((s) => (
            <div key={s} className="surface-card p-4">
              <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                {s.toLowerCase()}
              </div>
              <div className="font-display text-2xl">{proposalCount.get(s) ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <p className="kicker">Recent signups</p>
          <Link href="/admin/signups" className="font-mono text-[11px]" style={{ color: "var(--pink)" }}>
            All signups →
          </Link>
        </div>
        {recentSignups.length === 0 ? (
          <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>No signups yet.</div>
        ) : (
          <ul className="surface-card divide-y" style={{ borderColor: "color-mix(in oklab, var(--navy) 6%, transparent)" }}>
            {recentSignups.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="font-medium truncate">{s.email}</span>
                <span className="text-xs truncate" style={{ color: "var(--navy-3)" }}>
                  {[s.source, s.campaign].filter(Boolean).join(" / ") || "direct"}
                </span>
                <span className="font-mono text-[11px] shrink-0" style={{ color: "var(--navy-3)" }}>
                  {fmtDate(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <p className="kicker">Recent listings</p>
          <Link href="/admin/listings" className="font-mono text-[11px]" style={{ color: "var(--pink)" }}>
            All listings →
          </Link>
        </div>
        {recentListings.length === 0 ? (
          <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>No listings yet.</div>
        ) : (
          <ul className="surface-card divide-y" style={{ borderColor: "color-mix(in oklab, var(--navy) 6%, transparent)" }}>
            {recentListings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="truncate">
                  <Link href={`/listings/${l.id}`} className="font-medium hover:underline">{l.title}</Link>
                  <span className="ml-2 text-xs" style={{ color: "var(--navy-3)" }}>
                    {l.city} · {l.user?.email}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  <StatusPill label={l.isActive ? "active" : "inactive"} accent={l.isActive} />
                  <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                    {fmtDate(l.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <p className="kicker mb-3">Email transport check</p>
        <EmailTestButton defaultEmail={me.email} />
        <p className="mt-2 text-xs" style={{ color: "var(--navy-3)" }}>
          Sends a real email via Resend if RESEND_API_KEY is configured; otherwise logs to the
          server console. The reply tells you which path ran.
        </p>
      </section>
    </>
  );
}
