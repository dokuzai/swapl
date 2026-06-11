import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import { AISettings } from "@/components/account/ai-settings";
import { PasskeysSection } from "@/components/account/passkeys";
import { toPasskeySummary } from "@/lib/auth/passkeys";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · swapl" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  // Registered WebAuthn passkeys, newest first (serialised — BigInt counter
  // never crosses the server/client boundary).
  const passkeys = (
    await prisma.webAuthnCredential.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    })
  ).map(toPasskeySummary);

  // Insurance policies across the user's swaps (either side of the agreement).
  const policies = await prisma.insurancePolicy.findMany({
    where: {
      agreement: {
        OR: [{ listing1: { userId: session.userId } }, { listing2: { userId: session.userId } }],
      },
    },
    include: { agreement: { include: { listing1: true, listing2: true } } },
    orderBy: { createdAt: "desc" },
  });

  const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Latest identity-check attempt — drives the pending/declined badge below
  // (User.verified flips only on approval).
  const latestIdv = await prisma.identityVerification.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });
  const idvBadge = user.verified
    ? { label: "Verified", bg: "var(--pink)", fg: "#fff" }
    : latestIdv?.status === "pending"
      ? { label: "Pending review", bg: "var(--cream-2)", fg: "var(--navy-3)" }
      : latestIdv?.status === "declined"
        ? { label: "Declined", bg: "#dc2626", fg: "#fff" }
        : { label: "Unverified", bg: "var(--cream-2)", fg: "var(--navy-3)" };

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
                style={{ background: idvBadge.bg, color: idvBadge.fg }}
              >
                {idvBadge.label}
              </span>
              <span className="text-sm" style={{ color: "var(--navy-2)" }}>
                {user.verified && user.verifiedAt
                  ? `Verified on ${user.verifiedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                  : latestIdv?.status === "pending"
                    ? "We're reviewing your documents — this usually takes minutes."
                    : "Required before your first swap acceptance."}
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--navy-2)" }}>
              We use a one-time KYC check (passport / national ID) at proposal acceptance. Your data isn&rsquo;t shared with the other host.
            </p>
          </section>

          <PasskeysSection passkeys={passkeys} />

          <AISettings />

          <section className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Your interests</h2>
            <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
              Pick the things you actually love about a place — coffee, jazz, surfing, vintage, you
              name it. They show on your public profile and steer the AI recommendations during
              your swap toward partners that match what you like.
            </p>
            <Link href="/account/interests" className="pill-ghost">Edit interests</Link>
          </section>

          <section className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Saved searches</h2>
            <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
              Pin a filter combination from /listings and we'll email you a daily digest of new
              homes that match. Plus and Pro members can keep up to 20 saved searches.
            </p>
            <Link href="/account/saved-searches" className="pill-ghost">Manage saved searches</Link>
          </section>

          {policies.length > 0 && (
            <section className="surface-card p-6 mb-6">
              <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Your coverage</h2>
              <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
                Every accepted swap is insured automatically. Your active and past policies live here.
              </p>
              <ul className="space-y-3">
                {policies.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                    style={{ borderColor: "var(--cream-2)" }}
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {p.agreement.listing1.city} ↔ {p.agreement.listing2.city}
                      </div>
                      <div className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                        {p.policyNumber} · €{p.coverageAmount.toLocaleString()} ·{" "}
                        {shortDate(p.agreement.dateFrom)}–{shortDate(p.agreement.dateTo)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
                        style={{
                          background: p.status === "active" ? "var(--pink)" : "var(--cream-2)",
                          color: p.status === "active" ? "#fff" : "var(--navy-3)",
                        }}
                      >
                        {p.status}
                      </span>
                      {p.documentsUrl && (
                        <a href={p.documentsUrl} target="_blank" rel="noreferrer" className="pill-ghost">
                          Certificate →
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
