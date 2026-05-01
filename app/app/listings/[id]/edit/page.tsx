import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditListingPage(props: PageProps<"/listings/[id]/edit">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit`);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  // Editing reuses the listing-form shape — for the demo this page surfaces the read-only summary
  // and links back to the new-listing flow which can be extended to support editing.
  return (
    <div className="wrap py-10 lg:py-14 max-w-3xl">
      <p className="kicker mb-3">Edit</p>
      <h1 className="font-display text-4xl tracking-[-0.02em] mb-6">{listing.title}</h1>
      <div className="surface-card p-6 space-y-4 text-sm">
        <p style={{ color: "var(--navy-2)" }}>
          Inline editing is wired up to the same shape as the new-listing form. To keep this scaffold small,
          the multi-step form is exposed via{" "}
          <Link href="/listings/new" style={{ color: "var(--pink)" }} className="font-medium">
            /listings/new
          </Link>
          ; the edit endpoint accepts the same payload at <code className="font-mono">PATCH /api/listings/[id]</code>{" "}
          (TODO: extend the form component to pre-fill state for an edit URL).
        </p>
        <Link href={`/listings/${id}`} className="pill-ghost">← Back to listing</Link>
      </div>
    </div>
  );
}
