import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { ONLINE_WINDOW_MS } from "@/lib/admin/metrics";
import { AdminTable, StatusPill, fmtDate } from "@/components/admin/data-table";
import UserActions from "./user-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · admin" };

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ online?: string }>;
}) {
  await requireAdminPage();

  const { online } = await searchParams;
  const onlineOnly = online === "1";
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

  const users = await prisma.user.findMany({
    where: onlineOnly ? { lastActiveAt: { gte: onlineSince } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
      verified: true,
      verifiedAt: true,
      suspendedAt: true,
      lastActiveAt: true,
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
          {onlineOnly
            ? `${users.length} online now (newest first).`
            : `${users.length} most recent (newest first).`}
        </p>
        <div className="mt-4">
          <Link
            href={onlineOnly ? "/admin/users" : "/admin/users?online=1"}
            className={onlineOnly ? "pill-primary" : "pill-ghost"}
          >
            Online only
          </Link>
        </div>
      </header>

      <AdminTable
        headers={["", "Email", "Name", "Email verified", "ID verified", "Status", "Role", "Listings", "Created", "Actions"]}
        emptyLabel={onlineOnly ? "Nobody online right now." : "No users yet."}
        rows={users.map((u) => {
          const isOnline =
            u.lastActiveAt !== null && u.lastActiveAt.getTime() >= onlineSince.getTime();
          return [
            <span
              key="o"
              title={
                isOnline
                  ? "Online"
                  : u.lastActiveAt
                    ? `Last seen ${fmtDate(u.lastActiveAt)}`
                    : "Never"
              }
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: isOnline ? "#22c55e" : "#ef4444" }}
            />,
            <span key="e" className="font-medium">{u.email}</span>,
            <span key="n" style={{ color: "var(--navy-3)" }}>{u.name ?? "—"}</span>,
            u.emailVerifiedAt ? (
              <StatusPill key="v" label="verified" accent />
            ) : (
              <StatusPill key="v" label="unverified" />
            ),
            u.verified ? (
              <span key="kv" title={u.verifiedAt ? `Verified ${fmtDate(u.verifiedAt)}` : "Verified"}>
                <StatusPill label={u.verifiedAt ? fmtDate(u.verifiedAt) : "verified"} accent />
              </span>
            ) : (
              <StatusPill key="kv" label="—" />
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
          ];
        })}
      />
    </>
  );
}
