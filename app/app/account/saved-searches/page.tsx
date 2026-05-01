import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { getEffectivePlan } from "@/lib/billing/limits";
import { prisma } from "@/lib/db";
import { SavedSearchTable } from "./table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved searches · swapl" };

export default async function SavedSearchesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/saved-searches");
  const plan = await getEffectivePlan(session.userId);

  if (plan.id === "free") {
    return (
      <>
        <Navbar />
        <main className="flex-1">
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <p className="kicker mb-3">Saved searches</p>
            <h1 className="font-display text-4xl tracking-[-0.02em] mb-4">Save up to 20 searches with daily alerts.</h1>
            <p className="mb-6 text-[16px]" style={{ color: "var(--navy-2)" }}>
              Saved searches are part of swapl Plus. Pin a city + dates + must-haves combo and we'll
              email when a fresh listing matches.
            </p>
            <Link href="/pricing" className="pill-primary">See plans</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const items = await prisma.savedSearch.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <p className="kicker mb-3">Saved searches</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-4">Your alerts</h1>
          <p className="mb-6 text-[16px]" style={{ color: "var(--navy-2)" }}>
            Save a filter combination from /listings and we'll send a daily email digest when new
            homes match. Up to 20 saved searches. {items.length}/20 used.
          </p>
          <SavedSearchTable items={items.map((s) => ({
            id: s.id, name: s.name, query: s.query, alertEnabled: s.alertEnabled, createdAt: s.createdAt.toISOString(),
          }))} />
          <p className="mt-8 text-sm" style={{ color: "var(--navy-3)" }}>
            Tip: open <Link href="/listings" style={{ color: "var(--pink)" }}>browse</Link>, dial in the filters you want,
            then come back here and add the URL's query string with a name.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
