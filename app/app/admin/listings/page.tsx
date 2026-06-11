import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/abilities";
import { AdminTable, StatusPill, fmtDate } from "@/components/admin/data-table";
import ListingActions from "./listing-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Listings · admin" };

export default async function AdminListings() {
  await requireAdminPage();

  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { email: true } } },
  });

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-3">Inventory</p>
        <h1 className="font-display text-3xl tracking-[-0.02em]">Listings</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
          {listings.length} most recent (newest first).
        </p>
      </header>

      <AdminTable
        headers={["Title", "City", "Owner", "Active", "Verification", "Created", "Actions"]}
        emptyLabel="No listings yet."
        rows={listings.map((l) => [
          <Link key="t" href={`/listings/${l.id}`} className="font-medium hover:underline">
            {l.title}
          </Link>,
          <span key="ci" style={{ color: "var(--navy-3)" }}>{l.city}</span>,
          <span key="o" style={{ color: "var(--navy-3)" }}>{l.user?.email ?? "—"}</span>,
          l.isActive ? (
            <StatusPill key="a" label="active" accent />
          ) : (
            <StatusPill key="a" label="inactive" />
          ),
          <StatusPill key="v" label={l.verificationStatus} accent={l.verificationStatus === "approved"} />,
          <span key="c" className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
            {fmtDate(l.createdAt)}
          </span>,
          <ListingActions key="x" listingId={l.id} active={l.isActive} />,
        ])}
      />
    </>
  );
}
