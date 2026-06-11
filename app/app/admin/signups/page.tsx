import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { AdminTable, fmtDate } from "@/components/admin/data-table";
import { InviteBatchButton } from "@/components/admin/invite-batch-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signups · admin" };

export default async function AdminSignups() {
  await requireAdminPage();

  const [signups, invited, registered, remaining] = await Promise.all([
    prisma.betaSignup.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.betaSignup.count({ where: { invitedAt: { not: null } } }),
    prisma.betaSignup.count({ where: { userId: { not: null } } }),
    prisma.betaSignup.count({ where: { userId: null, invitedAt: null } }),
  ]);

  return (
    <>
      <header className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="kicker mb-3">Growth</p>
          <h1 className="font-display text-3xl tracking-[-0.02em]">Beta signups</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
            {signups.length} most recent (newest first). Export includes every row.
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            {invited} invited · {registered} registered · {remaining} awaiting invite
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <InviteBatchButton remaining={remaining} />
          <a
            href="/api/admin/signups/export"
            className="inline-block font-mono text-[11px] uppercase tracking-[.1em] px-4 py-2 rounded-full"
            style={{ background: "var(--pink)", color: "#fff" }}
          >
            Export CSV →
          </a>
        </div>
      </header>

      <AdminTable
        headers={["Email", "Source / medium / campaign", "Landing page", "Linked user", "Invited", "Created"]}
        emptyLabel="No signups yet."
        rows={signups.map((s) => [
          <span key="e" className="font-medium">{s.email}</span>,
          <span key="s" style={{ color: "var(--navy-3)" }}>
            {[s.source, s.medium, s.campaign].filter(Boolean).join(" / ") || "—"}
          </span>,
          <span key="l" style={{ color: "var(--navy-3)" }}>{s.landingPage ?? "—"}</span>,
          <span key="u" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {s.userId ?? "—"}
          </span>,
          <span key="i" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {s.invitedAt ? fmtDate(s.invitedAt) : "—"}
          </span>,
          <span key="c" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {fmtDate(s.createdAt)}
          </span>,
        ])}
      />
    </>
  );
}
