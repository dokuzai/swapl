import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CalendarEditor } from "./calendar-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Availability · swapl" };

export default async function EditCalendarPage(props: PageProps<"/listings/[id]/edit/calendar">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/listings/${id}/edit/calendar`);
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, userId: true, title: true },
  });
  if (!listing) notFound();
  if (listing.userId !== session.userId) redirect(`/listings/${id}`);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-2xl">
          <Link
            href={`/listings/${id}/edit`}
            className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block"
            style={{ color: "var(--navy-3)" }}
          >
            ← {listing.title}
          </Link>
          <CalendarEditor listingId={id} />
        </div>
      </main>
      <Footer />
    </>
  );
}
