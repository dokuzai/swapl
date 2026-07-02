import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { AdminTable, StatusPill, fmtDate, type ColumnFilter } from "@/components/admin/data-table";
import {
  DISPUTE_STATUSES,
  DISPUTE_CATEGORIES,
  isUrgentCategory,
  parsePhotos,
} from "@/lib/disputes";
import DisputeActions from "./dispute-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disputes · admin" };

export default async function AdminDisputes({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  await requireAdminPage();

  const { status, category } = await searchParams;
  const statusFilter = status && (DISPUTE_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const categoryFilter =
    category && (DISPUTE_CATEGORIES as readonly string[]).includes(category) ? category : undefined;

  const fetched = await prisma.swapDispute.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      openedBy: { select: { email: true, name: true } },
      resolvedBy: { select: { email: true, name: true } },
      agreement: {
        select: {
          id: true,
          proposalId: true,
          insurancePolicy: { select: { policyNumber: true } },
        },
      },
      keysStay: { select: { id: true, insurancePolicyId: true } },
      _count: { select: { messages: true } },
    },
  });

  // Open cases first (open|investigating|awaiting_response), then resolved/closed.
  const isOpen = (s: string) => s !== "resolved" && s !== "closed";
  const disputes = [
    ...fetched.filter((d) => isOpen(d.status)),
    ...fetched.filter((d) => !isOpen(d.status)),
  ];

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Trust &amp; safety</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Disputes</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          Resolution center queue. Urgent (safety / access) cases are flagged —
          point members to the 24/7 line before anything else.
        </p>
      </header>

      <AdminTable
        headers={[
          "Opened by",
          "Category",
          "Status",
          "Detail",
          "Msgs",
          "Assignee",
          "Swap / policy",
          "Opened",
          "Actions",
        ]}
        emptyLabel="No disputes match. Quiet is good."
        filterAction="/admin/disputes"
        filterValues={{ status: status ?? "", category: category ?? "" }}
        filters={
          [
            null,
            {
              type: "select",
              name: "category",
              options: DISPUTE_CATEGORIES.map((c) => ({ value: c, label: c })),
            },
            {
              type: "select",
              name: "status",
              options: DISPUTE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            },
            null,
            null,
            null,
            null,
            null,
            null,
          ] satisfies ColumnFilter[]
        }
        rows={disputes.map((d) => {
          const urgent = isUrgentCategory(d.category);
          const open = isOpen(d.status);
          const photoCount = parsePhotos(d.photos).length;
          return [
            <span key="o" className="font-medium">
              {d.openedBy.name ?? d.openedBy.email}
            </span>,
            <span key="c" className="inline-flex items-center gap-1.5">
              <span className="font-mono text-[11px]">{d.category}</span>
              {urgent && (
                <span
                  className="font-mono text-[9px] uppercase tracking-[.1em] px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--pink)", color: "#fff" }}
                  title="Safety / access — foreground the 24/7 line"
                >
                  urgent
                </span>
              )}
            </span>,
            <StatusPill key="s" label={d.status.replace(/_/g, " ")} accent={open} />,
            <span
              key="d"
              className="whitespace-pre-wrap max-w-[32ch] inline-block"
              style={{ color: "var(--navy-3)" }}
            >
              {d.description}
              {photoCount > 0 && (
                <span className="block font-mono text-[10px] mt-1" style={{ color: "var(--navy-3)" }}>
                  📎 {photoCount} photo{photoCount === 1 ? "" : "s"}
                </span>
              )}
              {d.resolution && (
                <span className="block mt-1" style={{ color: "var(--navy-2)" }}>
                  ↳ {d.resolution}
                </span>
              )}
            </span>,
            <span key="m" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
              {d._count.messages}
            </span>,
            <span key="a" style={{ color: "var(--navy-3)" }}>
              {d.resolvedBy ? (d.resolvedBy.name ?? d.resolvedBy.email) : "—"}
            </span>,
            <span key="l" className="inline-flex flex-col gap-0.5">
              {d.agreement ? (
                <>
                  <Link href={`/swaps/${d.agreement.proposalId}`} className="hover:underline">
                    Swap
                  </Link>
                  {d.agreement.insurancePolicy ? (
                    <Link
                      href="/admin/insurance"
                      className="font-mono text-[10px] hover:underline"
                      style={{ color: "var(--navy-3)" }}
                    >
                      {d.agreement.insurancePolicy.policyNumber}
                    </Link>
                  ) : (
                    <span className="font-mono text-[10px]" style={{ color: "var(--navy-3)" }}>
                      no policy
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>Keys stay</span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--navy-3)" }}>
                    {d.keysStay?.insurancePolicyId ?? "no policy"}
                  </span>
                </>
              )}
            </span>,
            <span key="t" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
              {fmtDate(d.createdAt)}
            </span>,
            <DisputeActions key="x" disputeId={d.id} status={d.status} />,
          ];
        })}
      />
    </>
  );
}
