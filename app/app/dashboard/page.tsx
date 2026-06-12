import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { ListingCard } from "@/components/listing/listing-card";
import { InspireButton } from "@/components/ui/inspire-button";
import { AISuggestions } from "@/components/listing/ai-suggestions";
import { VerifyEmailBanner } from "@/components/account/verify-email-banner";
import {
  IdentityVerificationCard,
  type IdentityVerificationStatus,
} from "@/components/account/identity-verification-card";
import { toDTO, formatDateRange } from "@/lib/listing-utils";
import { getDictionary } from "@/lib/i18n/server";
import {
  applyVerificationUpdate,
  diditEnabled,
  getSessionStatus,
} from "@/lib/verification/didit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · swapl" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const { verification } = await searchParams;
  const backFromVerification = verification === "done";

  const [user, listings, incoming, outgoing, agreements, dict] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.listing.findMany({
      where: { userId: session.userId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.swapProposal.count({
      where: { targetListing: { userId: session.userId }, status: { in: ["PENDING", "COUNTERED"] } },
    }),
    prisma.swapProposal.count({
      where: { proposerId: session.userId, status: { in: ["PENDING", "COUNTERED"] } },
    }),
    prisma.swapAgreement.count({
      where: {
        OR: [{ listing1: { userId: session.userId } }, { listing2: { userId: session.userId } }],
        status: "ACTIVE",
      },
    }),
    getDictionary(),
  ]);

  // Identity verification (Didit) card: only when configured server-side and
  // the user isn't verified yet. Coming back from the hosted flow
  // (?verification=done) we re-poll once so the card shows the fresh outcome
  // even before the webhook lands.
  let idvStatus: IdentityVerificationStatus | null = null;
  if (user && diditEnabled() && !user.verified) {
    const latest = await prisma.identityVerification.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });
    idvStatus = (latest?.status as IdentityVerificationStatus) ?? "none";
    if (latest && latest.status === "pending" && backFromVerification) {
      try {
        const snapshot = await getSessionStatus(latest.sessionId);
        const applied = await applyVerificationUpdate(latest.sessionId, snapshot.diditStatus, snapshot.raw);
        if (applied) idvStatus = applied.status;
      } catch (err) {
        console.error("[dashboard] verification poll failed", err);
      }
    }
  } else if (user?.verified && backFromVerification) {
    idvStatus = "approved"; // webhook already landed: show the success state once
  }

  return (
    <div className="wrap py-10 lg:py-14">
      {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
      <header className="mb-10 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="kicker mb-3">{dict["dashboard.greeting"]} {user?.name ?? user?.email.split("@")[0]} 👋</p>
          <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
            {dict["dashboard.title"]}
          </h1>
        </div>
        <InspireButton label={dict["inspire.cta"]} />
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        <Stat label={dict["dashboard.statWaitingOnYou"]} value={incoming} href="/swaps" />
        <Stat label={dict["dashboard.statSentAwaiting"]} value={outgoing} href="/swaps" />
        <Stat label={dict["dashboard.statActiveSwaps"]} value={agreements} href="/swaps" accent />
      </section>

      {idvStatus !== null && <IdentityVerificationCard status={idvStatus} />}

      <section className="mb-12">
        <AISuggestions />
      </section>

      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl tracking-[-0.01em]">{dict["dashboard.yourListings"]}</h2>
          <Link href="/listings/new" className="pill-primary">{dict["dashboard.newListing"]}</Link>
        </div>
        {listings.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <h3 className="font-display text-xl mb-2">{dict["dashboard.empty.title"]}</h3>
            <p className="mb-5" style={{ color: "var(--navy-2)" }}>
              {dict["dashboard.empty.body"]}
            </p>
            <Link href="/listings/new" className="pill-primary">{dict["dashboard.empty.cta"]}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={toDTO(l)} hrefSuffix="/edit" />
            ))}
          </div>
        )}
      </section>

      <section className="surface-card p-6">
        <h2 className="font-display text-xl tracking-[-0.01em] mb-3">{dict["dashboard.account"]}</h2>
        <p className="text-sm mb-2" style={{ color: "var(--navy-2)" }}>
          {dict["dashboard.signedInAs"]} <span className="font-medium">{session.email}</span>
        </p>
        <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
          {dict["account.joined"]} {user?.createdAt && formatDateRange(user.createdAt.toISOString(), user.createdAt.toISOString()).split(" – ")[0]}
        </p>
        <div className="flex gap-3">
          <Link href="/account" className="pill-ghost">{dict["dashboard.accountSettings"]}</Link>
          <form action="/api/auth/logout" method="post">
            <button className="pill-ghost" type="submit">{dict["dashboard.signOut"]}</button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, href, accent }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      className="surface-card p-6 block"
      style={accent ? { background: "var(--pink-light)" } : undefined}
    >
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
        {label}
      </div>
      <div className="font-display text-4xl" style={{ color: accent ? "var(--pink)" : "var(--navy)" }}>
        {value}
      </div>
    </Link>
  );
}
