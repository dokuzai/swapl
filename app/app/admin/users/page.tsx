import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { AdminTable, StatusPill, fmtDate } from "@/components/admin/data-table";
import UserActions from "./user-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · admin" };

export default async function AdminUsers() {
  await requireAdminPage();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
      suspendedAt: true,
      role: true,
      createdAt: true,
      _count: { select: { listings: true } },
    },
  });

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Members</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Users</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          {users.length} most recent (newest first).
        </p>
      </header>

      <AdminTable
        headers={["Email", "Name", "Email verified", "Status", "Role", "Listings", "Created", "Actions"]}
        emptyLabel="No users yet."
        rows={users.map((u) => [
          <span key="e" className="font-medium">{u.email}</span>,
          <span key="n" style={{ color: "var(--navy-3)" }}>{u.name ?? "—"}</span>,
          u.emailVerifiedAt ? (
            <StatusPill key="v" label="verified" accent />
          ) : (
            <StatusPill key="v" label="unverified" />
          ),
          u.suspendedAt ? (
            <StatusPill key="s" label="suspended" accent />
          ) : (
            <StatusPill key="s" label="active" />
          ),
          <span key="r" className="font-mono text-[11px]" style={{ color: u.role === "swapl_admin" ? "var(--pink)" : "var(--navy-3)" }}>
            {u.role}
          </span>,
          <span key="l">{u._count.listings}</span>,
          <span key="c" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {fmtDate(u.createdAt)}
          </span>,
          <UserActions key="x" userId={u.id} suspended={Boolean(u.suspendedAt)} />,
        ])}
      />
    </>
  );
}
