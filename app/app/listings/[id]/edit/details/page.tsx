import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma, parseJSON } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { PropertyType } from "@/lib/types";
import ListingForm, { type ListingEditInitial } from "@/app/listings/new/listing-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit listing · swapl" };

export default async function EditDetailsPage(props: PageProps<"/listings/[id]/edit/details">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit/details`);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  // JSON-string columns parsed here so the client form gets plain arrays.
  const initial: ListingEditInitial = {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    propertyType: listing.propertyType as PropertyType,
    city: listing.city,
    neighbourhood: listing.neighbourhood,
    country: listing.country,
    address: listing.address,
    floor: listing.floor,
    sizeSqm: listing.sizeSqm,
    sleeps: listing.sleeps,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    stepFreeAccess: listing.stepFreeAccess,
    hasElevator: listing.hasElevator,
    petsAllowed: listing.petsAllowed,
    petTypes: parseJSON<string[]>(listing.petTypes, []),
    wfhSetup: listing.wfhSetup,
    wfhDesks: listing.wfhDesks,
    bikeIncluded: listing.bikeIncluded,
    hasParking: listing.hasParking,
    balcony: listing.balcony,
    rooftop: listing.rooftop,
    garden: listing.garden,
    courtyard: listing.courtyard,
    piano: listing.piano,
    pool: listing.pool,
    gym: listing.gym,
    ac: listing.ac,
    dishwasher: listing.dishwasher,
    washer: listing.washer,
    dryer: listing.dryer,
    availableFrom: listing.availableFrom.toISOString(),
    availableTo: listing.availableTo.toISOString(),
    minStayDays: listing.minStayDays,
    maxStayDays: listing.maxStayDays,
    photos: parseJSON<string[]>(listing.photos, []),
    tags: parseJSON<string[]>(listing.tags, []),
  };

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14">
          <Link
            href={`/listings/${id}/edit`}
            className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block"
            style={{ color: "var(--navy-3)" }}
          >
            ← Manage listing
          </Link>
          <header className="mb-10 max-w-[640px]">
            <p className="kicker mb-3">Edit listing</p>
            <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
              {listing.title}
            </h1>
            <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
              Everything is pre-filled — jump to any step, change what you need, then save from the review step.
            </p>
          </header>
          <ListingForm listing={initial} />
        </div>
      </main>
      <Footer />
    </>
  );
}
