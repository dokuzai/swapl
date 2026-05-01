import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import { AISettings } from "@/components/account/ai-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · swapl" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <header className="mb-10">
            <p className="kicker mb-3">Account</p>
            <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">Settings</h1>
          </header>

          <section className="surface-card p-6 mb-6 space-y-3">
            <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
              <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                Email
              </span>
              <span>{user.email}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
              <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                Name
              </span>
              <span>{user.name ?? "—"}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
              <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                Joined
              </span>
              <span>{user.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            </div>
          </section>

          <section className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Identity verification</h2>
            <div className="flex items-center gap-3 mb-3">
              <span
                className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
                style={{
                  background: user.verified ? "var(--pink)" : "var(--cream-2)",
                  color: user.verified ? "#fff" : "var(--navy-3)",
                }}
              >
                {user.verified ? "Verified" : "Unverified"}
              </span>
              <span className="text-sm" style={{ color: "var(--navy-2)" }}>
                Required before your first swap acceptance.
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--navy-2)" }}>
              We use a one-time KYC check (passport / national ID) at proposal acceptance. Your data isn&rsquo;t shared with the other host.
            </p>
          </section>

          <AISettings />

          <section className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Saved searches</h2>
            <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
              Pin a filter combination from /listings and we'll email you a daily digest of new
              homes that match. Plus and Pro members can keep up to 20 saved searches.
            </p>
            <Link href="/account/saved-searches" className="pill-ghost">Manage saved searches</Link>
          </section>

          <section className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Notifications</h2>
            <p className="text-sm" style={{ color: "var(--navy-2)" }}>
              Email is on by default for new proposals, replies, and accepted swaps. We&rsquo;ll never email you about marketing.
            </p>
          </section>

          <section className="surface-card p-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Sign out</h2>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="pill-ghost">Sign out of swapl</button>
            </form>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
