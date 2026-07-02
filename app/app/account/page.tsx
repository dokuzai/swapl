// /account (DOK-147) — Airbnb-style structured settings: Personal information,
// Login & security, Privacy, Notifications, Get help. On mobile a chevron
// list at the top jumps to each section; on desktop the sections read inline.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import { AISettings } from "@/components/account/ai-settings";
import { TravelProfileSection } from "@/components/account/travel-profile";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { PasskeysSection } from "@/components/account/passkeys";
import { PersonalInfoEditor } from "@/components/account/personal-info";
import { ChangePasswordForm } from "@/components/account/change-password";
import { PrivacyToggles, NotificationToggles } from "@/components/account/settings-toggles";
import { toPasskeySummary } from "@/lib/auth/passkeys";
import { parseSettings } from "@/lib/settings";
import { ownContactChannels } from "@/lib/contact-channels";
import { marketingUrl } from "@/lib/marketing/urls";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { ProofOfCoverBadge } from "@/components/insurance/proof-of-cover-badge";
import { tonExplorerUrl } from "@/lib/insurance/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · swapl" };

const SECTIONS: { id: string; titleKey: DictKey }[] = [
  { id: "personal-info", titleKey: "account.personal.title" },
  { id: "login-security", titleKey: "account.security.title" },
  { id: "privacy", titleKey: "account.privacy.title" },
  { id: "notifications", titleKey: "account.notifications.title" },
  { id: "get-help", titleKey: "account.help.title" },
];

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const settings = parseSettings(user.settings);

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

  const shortDate = (d: Date) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });

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
        ? { label: "Declined", bg: "var(--destructive)", fg: "#fff" }
        : { label: "Unverified", bg: "var(--cream-2)", fg: "var(--navy-3)" };

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-8">
              <p className="kicker mb-3">{t("account.kicker")}</p>
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t("account.title")}</h1>
            </header>

            {/* Apple-style identity header: avatar, name, email centred above
                the settings sections. */}
            <div className="flex flex-col items-center text-center mb-12">
              {user.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.avatar}
                  alt={user.name ?? user.email}
                  width={96}
                  height={96}
                  className="rounded-full object-cover"
                  style={{ width: 96, height: 96, border: "2px solid var(--line)" }}
                />
              ) : (
                <div
                  className="rounded-full flex items-center justify-center font-display font-medium"
                  style={{ width: 96, height: 96, fontSize: 40, background: "var(--navy)", color: "var(--cream)" }}
                  aria-hidden
                >
                  {(user.name ?? user.email).charAt(0).toUpperCase()}
                </div>
              )}
              <h2 className="font-display text-2xl tracking-[-0.01em] mt-4">{user.name ?? user.email}</h2>
              <p className="text-sm mt-1" style={{ color: "var(--navy-2)" }}>{user.email}</p>
            </div>

            {/* Mobile: section list with chevrons. Desktop reads inline below. */}
            <nav aria-label={t("account.nav.title")} className="md:hidden surface-card surface-card--static mb-10 overflow-hidden">
              <ul>
                {SECTIONS.map((s) => (
                  <li key={s.id} className="border-t first:border-t-0" style={{ borderColor: "var(--line)" }}>
                    <a href={`#${s.id}`} className="flex items-center justify-between px-5 py-4 text-sm font-medium">
                      {t(s.titleKey)}
                      <span aria-hidden style={{ color: "var(--navy-3)" }}>›</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* ============ Personal information ============ */}
            <section id="personal-info" className="mb-12 scroll-mt-24">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("account.personal.title")}</h2>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("account.personal.body")}</p>

              <div className="surface-card surface-card--static p-6 mb-6">
                <PersonalInfoEditor
                  initial={{
                    name: user.name ?? "",
                    bio: user.bio ?? "",
                    work: user.work ?? "",
                    languages: parseJSON<string[]>(user.languages, []),
                    homeCity: user.homeCity ?? "",
                    homeCountry: user.homeCountry ?? "",
                    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
                    contactChannels: ownContactChannels(user.contactChannels),
                  }}
                />
              </div>

              <div className="surface-card surface-card--static p-6 mb-6">
                <h3 className="font-display text-xl tracking-[-0.01em] mb-3">{t("account.interests.title")}</h3>
                <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>{t("account.interests.body")}</p>
                <Link href="/account/interests" className="pill-ghost">{t("account.interests.cta")}</Link>
              </div>

              <div className="surface-card surface-card--static p-6 mb-6">
                <h3 className="font-display text-xl tracking-[-0.01em] mb-3">{t("account.savedSearches.title")}</h3>
                <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>{t("account.savedSearches.body")}</p>
                <Link href="/account/saved-searches" className="pill-ghost">{t("account.savedSearches.cta")}</Link>
              </div>

              <div className="surface-card surface-card--static p-6">
                <h3 className="font-display text-xl tracking-[-0.01em] mb-3">{t("account.travelWindows.title")}</h3>
                <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>{t("account.travelWindows.body")}</p>
                <Link href="/account/travel-windows" className="pill-ghost">{t("account.travelWindows.cta")}</Link>
              </div>
            </section>

            {/* ============ Keys (travel points) ============ */}
            <section className="mb-12">
              <div className="surface-card surface-card--static p-6 flex items-center justify-between gap-4" style={{ background: "var(--pink-light)" }}>
                <div className="min-w-0">
                  <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("keys.account.title")}</h2>
                  <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("keys.account.body")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-4xl leading-none" style={{ color: "var(--pink)" }}>{user.keysBalance}</div>
                  <Link href="/account/keys" className="pill-ghost mt-3 inline-flex">{t("keys.account.cta")}</Link>
                </div>
              </div>
            </section>

            {/* ============ Login & security ============ */}
            <section id="login-security" className="mb-12 scroll-mt-24">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("account.security.title")}</h2>

              <div className="surface-card surface-card--static p-6 mb-6 space-y-3">
                <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                    {t("account.email")}
                  </span>
                  <span>{user.email}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                    {t("account.joined")}
                  </span>
                  <span>{user.createdAt.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
                <div className="pt-3 divider-dashed">
                  <p className="text-sm font-medium mb-2">{t("account.security.passwordTitle")}</p>
                  <ChangePasswordForm hasPassword={Boolean(user.passwordHash)} />
                </div>
              </div>

              <PasskeysSection passkeys={passkeys} />

              <div className="surface-card surface-card--static p-6 mb-6">
                <h3 className="font-display text-xl tracking-[-0.01em] mb-3">{t("account.identityTitle")}</h3>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
                    style={{ background: idvBadge.bg, color: idvBadge.fg }}
                  >
                    {idvBadge.label}
                  </span>
                  <span className="text-sm" style={{ color: "var(--navy-2)" }}>
                    {user.verified && user.verifiedAt
                      ? `Verified on ${user.verifiedAt.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })}.`
                      : latestIdv?.status === "pending"
                        ? "We're reviewing your documents — this usually takes minutes."
                        : t("account.identityRequired")}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("account.identityBlurb")}</p>
              </div>

              <div className="surface-card surface-card--static p-6">
                <h3 className="font-display text-xl tracking-[-0.01em] mb-3">{t("account.signOut.title")}</h3>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="pill-ghost">{t("account.signOut.cta")}</button>
                </form>
              </div>
            </section>

            {/* ============ Privacy ============ */}
            <section id="privacy" className="mb-12 scroll-mt-24">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("account.privacy.title")}</h2>
              <div className="surface-card surface-card--static px-6 py-2 mb-6">
                <PrivacyToggles initial={settings} />
              </div>
              <TravelProfileSection />
              <AISettings />
            </section>

            {/* ============ Notifications ============ */}
            <section id="notifications" className="mb-12 scroll-mt-24">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("account.notifications.title")}</h2>
              <div className="surface-card surface-card--static px-6 py-2">
                <NotificationToggles initial={settings} />
              </div>
            </section>

            {/* ============ Coverage (only when policies exist) ============ */}
            {policies.length > 0 && (
              <section className="mb-12">
                <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("account.coverage.title")}</h2>
                <div className="surface-card surface-card--static p-6">
                  <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
                    {t("account.coverage.body")}
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
                          <ProofOfCoverBadge
                            tone="light"
                            onChainStatus={p.onChainStatus}
                            onChainRef={p.onChainRef}
                            explorerUrl={tonExplorerUrl(p.onChainRef, p.onChainNetwork)}
                            labels={{
                              badge: t("cover.proof.badge"),
                              blurb: t("cover.proof.blurb"),
                              view: t("cover.proof.view"),
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* ============ Get help ============ */}
            <section id="get-help" className="scroll-mt-24">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("account.help.title")}</h2>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("account.help.body")}</p>
              <div className="surface-card surface-card--static overflow-hidden">
                <HelpRow href={marketingUrl("/how-it-works")} label={t("account.help.helpCentre")} external />
                <HelpRow href={marketingUrl("/contact")} label={t("account.help.contact")} external />
                <HelpRow href="mailto:hello@swapl.fun?subject=Report%20a%20problem" label={t("account.help.report")} />
              </div>
            </section>
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}

function HelpRow({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center justify-between px-5 py-4 text-sm font-medium border-t first:border-t-0"
      style={{ borderColor: "var(--line)" }}
    >
      {label}
      <span aria-hidden style={{ color: "var(--navy-3)" }}>›</span>
    </a>
  );
}
