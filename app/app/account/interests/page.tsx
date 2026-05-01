import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseInterests } from "@/lib/interests";
import { InterestsForm } from "./interests-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your interests · swapl" };

export default async function InterestsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/interests");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href="/account" className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← Account
          </Link>
          <p className="kicker mb-3">Profile</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">What do you love about a place?</h1>
          <p className="mb-6 text-[16px]" style={{ color: "var(--navy-2)" }}>
            Pick up to 12 interests. They show on your public profile, help hosts feel out a fit at a
            glance, and steer the recommendations we surface during your swap — bookable
            partners that match what you actually like.
          </p>
          <InterestsForm
            initial={parseInterests(user.interests).map((t) => t.slug)}
            initialBio={user.bioVibe ?? ""}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
