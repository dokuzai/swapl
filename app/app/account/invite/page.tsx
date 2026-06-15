// /account/invite (DOK-157) — "Invite & earn". Share a referral link/code,
// watch verified friends climb you up the waitlist and the tier ladder, and
// invite friends to stay at your place. BINDING: referrals earn KEYS, never
// money; the two-sided reward only lands when the invitee VERIFIES (the API/lib
// enforce this). This page is read-only HYPE + the share affordances.

import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { ensureReferralCode, referralShareUrl } from "@/lib/growth/referrals";
import {
  currentTier,
  nextTier,
  waitlistPosition,
  REFERRAL_REWARD_KEYS,
  REFERRAL_REFEREE_KEYS,
} from "@/lib/growth/config";
import { ShareLink } from "./share-link";
import { InviteToStay } from "./invite-to-stay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invite & earn · swapl" };

const STATUS_KEY: Record<string, DictKey> = {
  pending: "invite.joined.status.pending",
  qualified: "invite.joined.status.qualified",
  rewarded: "invite.joined.status.rewarded",
};

export default async function InvitePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/invite");

  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const code = await ensureReferralCode(session.userId);

  const [referrals, keysAgg, listings, leaderboardGroups] = await Promise.all([
    prisma.referral.findMany({
      where: { ownerId: session.userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, source: true, referee: { select: { name: true } } },
    }),
    prisma.keysTransaction.aggregate({
      where: { userId: session.userId, kind: "referral_bonus" },
      _sum: { delta: true },
    }),
    prisma.listing.findMany({
      where: { userId: session.userId },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referral.groupBy({
      by: ["ownerId"],
      where: { status: { in: ["qualified", "rewarded"] } },
      _count: { _all: true },
      orderBy: { _count: { ownerId: "desc" } },
      take: 5,
    }),
  ]);

  const qualifiedCount = referrals.filter(
    (r) => r.status === "qualified" || r.status === "rewarded",
  ).length;
  const keysEarned = keysAgg._sum.delta ?? 0;
  const tier = currentTier(qualifiedCount);
  const next = nextTier(qualifiedCount);
  const position = waitlistPosition(qualifiedCount);

  // Resolve leaderboard owner names (first-name only for privacy).
  const ownerIds = leaderboardGroups.map((g) => g.ownerId);
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(owners.map((u) => [u.id, u.name]));
  const leaderboard = leaderboardGroups.map((g, i) => ({
    rank: i + 1,
    name: nameById.get(g.ownerId)?.split(" ")[0] ?? null,
    qualified: g._count._all,
    isYou: g.ownerId === session.userId,
  }));

  const shareUrl = referralShareUrl(code);

  const stat = (label: string, value: number | string) => (
    <div className="surface-card surface-card--static p-4 text-center">
      <div className="font-display text-3xl leading-none" style={{ color: "var(--pink)" }}>{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1.5" style={{ color: "var(--navy-3)" }}>{label}</div>
    </div>
  );

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-8">
              <p className="kicker mb-3">{t("invite.kicker")}</p>
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t("invite.title")}</h1>
              <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>{t("invite.subtitle")}</p>
            </header>

            {/* ---- HYPE banner: scarcity + reward, both sides ---- */}
            <section className="mb-10">
              <div className="surface-card surface-card--static p-6" style={{ background: "var(--pink-light)" }}>
                <p className="text-[15px] font-medium" style={{ color: "var(--navy)" }}>{t("invite.hype")}</p>
                <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
                  {t("invite.reward.body", { reward: REFERRAL_REWARD_KEYS, referee: REFERRAL_REFEREE_KEYS })}
                </p>
              </div>
            </section>

            {/* ---- Share link / code ---- */}
            <section className="mb-10">
              <div className="surface-card surface-card--static p-6">
                <ShareLink code={code} url={shareUrl} />
              </div>
            </section>

            {/* ---- Stats ---- */}
            <section className="mb-10 grid grid-cols-3 gap-3">
              {stat(t("invite.stats.invited"), referrals.length)}
              {stat(t("invite.stats.qualified"), qualifiedCount)}
              {stat(t("invite.stats.earned"), keysEarned)}
            </section>

            {/* ---- Waitlist position + tier progress ---- */}
            <section className="mb-10">
              <div className="surface-card surface-card--static p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                    {t("invite.waitlist.label")}
                  </div>
                  <div className="font-display text-3xl leading-none" style={{ color: "var(--pink)" }}>#{position}</div>
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>{t("invite.waitlist.hint")}</p>

                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--cream-2)" }}>
                  <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
                    {t("invite.progress.label")}
                  </div>
                  {tier ? (
                    <p className="text-sm font-medium">{t("invite.tier.current", { label: tier.label })}</p>
                  ) : next ? (
                    <p className="text-sm">{t("invite.tier.none", { label: next.label })}</p>
                  ) : null}
                  {tier && <p className="text-sm mt-0.5" style={{ color: "var(--navy-2)" }}>{t("invite.tier.perk", { perk: tier.perk })}</p>}
                  {next ? (
                    <p className="text-sm mt-2" style={{ color: "var(--pink)" }}>
                      {t("invite.tier.next", { remaining: Math.max(0, next.threshold - qualifiedCount), label: next.label })}
                    </p>
                  ) : (
                    <p className="text-sm mt-2" style={{ color: "var(--pink)" }}>{t("invite.tier.maxed")}</p>
                  )}
                </div>
              </div>
            </section>

            {/* ---- Mini leaderboard ---- */}
            <section className="mb-10">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("invite.leaderboard.title")}</h2>
              <div className="surface-card surface-card--static p-6">
                {leaderboard.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("invite.leaderboard.empty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {leaderboard.map((row) => (
                      <li
                        key={row.rank}
                        className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                        style={{ borderColor: "var(--cream-2)" }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-display text-lg w-6 shrink-0" style={{ color: "var(--navy-3)" }}>{row.rank}</span>
                          <span className="text-sm font-medium truncate" style={row.isYou ? { color: "var(--pink)" } : undefined}>
                            {row.isYou ? t("invite.leaderboard.you") : row.name ?? t("invite.leaderboard.anon")}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--navy-2)" }}>
                          {t("invite.leaderboard.count", { count: row.qualified })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ---- People you invited ---- */}
            <section className="mb-10">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("invite.joined.title")}</h2>
              <div className="surface-card surface-card--static p-6">
                {referrals.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("invite.joined.empty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {referrals.map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                        style={{ borderColor: "var(--cream-2)" }}
                      >
                        <span className="text-sm font-medium truncate">
                          {r.referee?.name ?? t("invite.joined.anon")}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[.06em]" style={{ color: r.status === "pending" ? "var(--navy-3)" : "var(--pink)" }}>
                          {t(STATUS_KEY[r.status] ?? "invite.joined.status.pending")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ---- Invite someone to stay at your place ---- */}
            <section>
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("invite.toStay.title")}</h2>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("invite.toStay.body")}</p>
              <div className="surface-card surface-card--static p-6">
                <InviteToStay listings={listings} />
              </div>
            </section>

            <p className="mt-10 text-center">
              <Link href="/account/keys" className="text-sm font-medium" style={{ color: "var(--pink)" }}>
                ← {t("keys.tx.back")}
              </Link>
            </p>
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
