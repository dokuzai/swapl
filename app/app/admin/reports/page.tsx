import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { AdminTable, StatusPill, fmtDate } from "@/components/admin/data-table";
import ReportActions from "./report-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports · admin" };

export default async function AdminReports() {
  await requireAdminPage();

  const fetched = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      reporter: { select: { email: true, name: true } },
      targetUser: { select: { email: true, name: true } },
      listing: { select: { id: true, title: true } },
    },
  });

  // Open reports first, newest first within each bucket.
  const reports = [
    ...fetched.filter((r) => r.status === "open"),
    ...fetched.filter((r) => r.status !== "open"),
  ];

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Trust &amp; safety</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Reports</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          Newest first. Reach out to both sides before taking action.
        </p>
      </header>

      <AdminTable
        headers={["Reporter", "Target user", "Listing", "Reason", "Detail", "Status", "Filed", "Actions"]}
        emptyLabel="No reports. Quiet is good."
        rows={reports.map((r) => [
          <span key="r" className="font-medium">{r.reporter.name ?? r.reporter.email}</span>,
          <span key="t" style={{ color: "var(--navy-3)" }}>
            {r.targetUser ? (r.targetUser.name ?? r.targetUser.email) : "—"}
          </span>,
          r.listing ? (
            <Link key="l" href={`/listings/${r.listing.id}`} className="hover:underline">
              {r.listing.title}
            </Link>
          ) : (
            <span key="l" style={{ color: "var(--navy-3)" }}>—</span>
          ),
          <span key="re" className="font-mono text-[11px]">{r.reason}</span>,
          <span key="d" className="whitespace-pre-wrap max-w-[28ch] inline-block" style={{ color: "var(--navy-3)" }}>
            {r.detail ?? "—"}
          </span>,
          <span key="s" className="inline-flex flex-col gap-1">
            <StatusPill label={r.status} accent={r.status === "open"} />
            {r.resolution && (
              <span className="whitespace-pre-wrap max-w-[28ch]" style={{ color: "var(--navy-3)" }}>
                {r.resolution}
              </span>
            )}
          </span>,
          <span key="c" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {fmtDate(r.createdAt)}
          </span>,
          r.status === "open" ? (
            <ReportActions key="x" reportId={r.id} />
          ) : (
            <span key="x" style={{ color: "var(--navy-3)" }}>—</span>
          ),
        ])}
      />
    </>
  );
}
