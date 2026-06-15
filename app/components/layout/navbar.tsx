import Link from "next/link";
import { LogoMark } from "@/components/illustrations";
import { getSession } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
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
    <header className="sticky top-0 z-50 nav-blurred border-b border-line">
      <nav className="wrap flex items-center justify-between gap-4 py-4">
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

      {/* Mobile second row: scrollable tabs (browse pages) / search pill. */}
      {session && (
        <div className="md:hidden pb-2">
          <HeaderNav labels={navLabels} variant="mobile" />
        </div>
      )}

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
  );
}
