import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { AdminTable, fmtDate } from "@/components/admin/data-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signups · admin" };

export default async function AdminSignups() {
  await requireAdminPage();

  const signups = await prisma.betaSignup.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <>
      <header className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="kicker mb-3">Growth</p>
          <h1 className="font-display text-3xl tracking-[-0.02em]">Beta signups</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
            {signups.length} most recent (newest first). Export includes every row.
          </p>
        </div>
        <a
          href="/api/admin/signups/export"
          className="inline-block font-mono text-[11px] uppercase tracking-[.1em] px-4 py-2 rounded-full"
          style={{ background: "var(--pink)", color: "#fff" }}
        >
          Export CSV →
        </a>
      </header>

      <AdminTable
        headers={["Email", "Source / medium / campaign", "Landing page", "Linked user", "Created"]}
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
          <span key="c" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {fmtDate(s.createdAt)}
          </span>,
        ])}
      />
    </>
  );
}
