import Link from "next/link";
import { LogoMark } from "@/components/illustrations";
import { getSession } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { HeaderNav, type HeaderNavLabels } from "@/components/layout/header-nav";
import { AvatarMenu, type AvatarMenuLabels } from "@/components/layout/avatar-menu";
import { ReferrerNotifications } from "@/components/growth/referrer-notifications";

const NAV_LINKS: { href: string; key: DictKey }[] = [
  { href: "/listings", key: "nav.homes" },
  { href: "/swaps", key: "nav.mySwaps" },
];

// Airbnb-style header for signed-in users (DOK-150): logo left, category
// tabs (browse pages) or compact search pill (everywhere else) in the
// center, avatar dropdown right. Signed-out keeps the original marketing
// header. On mobile the center slot moves to a second scrollable row.
export async function Navbar() {
  const [session, { locale, dict }] = await Promise.all([getSession(), getI18n()]);

  const navLabels: HeaderNavLabels = {
    tabsAria: dict["browse.chips.ariaLabel"],
    homes: dict["browse.chips.homes"],
    experiences: dict["browse.chips.experiences"],
    services: dict["browse.chips.services"],
    newBadge: dict["header.tabs.new"],
    searchWhere: dict["header.search.where"],
    searchDates: dict["header.search.dates"],
    searchWho: dict["header.search.who"],
    searchLabel: dict["header.search.label"],
  };

  const menuLabels: AvatarMenuLabels = {
    open: dict["menu.open"],
    wishlists: dict["menu.wishlists"],
    trips: dict["menu.trips"],
    keys: dict["keys.menu"],
    invite: dict["invite.menu"],
    messages: dict["menu.messages"],
    profile: dict["menu.profile"],
    story: dict["menu.story"],
    accountSettings: dict["dashboard.accountSettings"],
    help: dict["menu.help"],
    language: dict["locale.label"],
    listYourHome: dict["nav.listMyHome"],
    signOut: dict["dashboard.signOut"],
    waitingOnYou: dict["menu.waitingOnYou"],
  };

  return (
    // Provide i18n context to the header's client children (AvatarMenu →
    // AppRatingDialog, etc.) which call useT(). The Navbar renders OUTSIDE the
    // per-page I18nProviderShell, so it must supply its own LocaleProvider —
    // otherwise every signed-in page crashes once the avatar menu mounts.
    <LocaleProvider locale={locale} dict={dict}>
    {/* Transparent band — no background of its own. The nav sits in a
        floating Liquid Glass pill so page content scrolls under it and
        shows through the blur (DOK: liquid-glass header/footer). */}
    <header className="sticky top-0 z-50">
      <div className="wrap pt-3">
      <nav className="flex items-center justify-between gap-4 rounded-[22px] liquid-glass px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-[22px] font-medium tracking-tight shrink-0">
          <LogoMark color="var(--navy)" accent="var(--pink)" />
          <span>
            swapl<span style={{ color: "var(--pink)" }}>.</span>
          </span>
        </Link>

        {session ? (
          <div className="hidden md:flex flex-1 justify-center min-w-0">
            <HeaderNav labels={navLabels} variant="desktop" />
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="nav-link">
                {dict[l.key]}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {session ? (
            <>
              <Link href="/dashboard" className="hidden lg:inline-flex nav-link">
                {dict["nav.dashboard"]}
              </Link>
              <AvatarMenu
                initial={(session.name ?? session.email)[0].toUpperCase()}
                userId={session.userId}
                locale={locale}
                labels={menuLabels}
              />
            </>
          ) : (
            <>
              <LocaleSwitcher locale={locale} label={dict["locale.label"]} />
              <Link href="/login" className="hidden sm:inline-flex nav-link">
                {dict["nav.signIn"]}
              </Link>
              <Link href="/register" className="pill-primary">
                {dict["nav.listMyHome"]}
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Mobile second row: scrollable tabs (browse pages) / search pill —
          its own floating glass pill below the main bar. */}
      {session && (
        <div className="md:hidden mt-2">
          <div className="rounded-[22px] liquid-glass py-2">
            <HeaderNav labels={navLabels} variant="mobile" />
          </div>
        </div>
      )}
      </div>

      {/* Real-time referrer toast (DOK-157): "NAME just verified — you earned
          Keys!" while the app is open. */}
      {session && (
        <ReferrerNotifications
          copy={{
            named: dict["referral.referrerToastNamed"],
            anon: dict["referral.referrerToast"],
          }}
        />
      )}
    </header>
    </LocaleProvider>
  );
}
