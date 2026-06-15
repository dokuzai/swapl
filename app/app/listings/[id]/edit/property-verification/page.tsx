import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma, parseJSON } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import PropertyVerificationForm, { type VerificationInitial } from "./property-verification-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify ownership · swapl" };

type StoredDoc = { url: string; label: string };

export default async function PropertyVerificationPage(
  props: PageProps<"/listings/[id]/edit/property-verification">
) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit/property-verification`);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  const current = await prisma.propertyVerification.findFirst({
    where: { listingId: id },
    orderBy: { createdAt: "desc" },
  });

  const initial: VerificationInitial = current
    ? {
        status: current.status as VerificationInitial["status"],
        documents: parseJSON<StoredDoc[]>(current.documents, []),
        note: current.note,
        aiClassification: current.aiClassification,
        documentType: (current.documentType as VerificationInitial["documentType"]) ?? null,
        ineligibleReason: listing.ineligibleReason,
      }
    : {
        status: "none",
        documents: [],
        note: null,
        aiClassification: null,
        documentType: null,
        ineligibleReason: listing.ineligibleReason,
      };

  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link
            href={`/listings/${id}/edit`}
            className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block"
            style={{ color: "var(--navy-3)" }}
          >
            ← {listing.title}
          </Link>
          <PropertyVerificationForm
            listingId={id}
            ownerVerified={listing.ownerVerified}
            initial={initial}
          />
        </div>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
