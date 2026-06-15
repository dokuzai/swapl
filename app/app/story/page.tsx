// /story (DOK-158) — "Your Swapl story": a year-grouped postcard timeline of
// every place the member has stayed (trips) and everyone they've hosted, the
// four headline counts, and a shareable card that bakes in the referral link
// for the viral loop. Server component: it builds the story + mints the
// referral code, then hands plain data to the client <StoryView>. A gentle
// empty state nudges first-timers toward their first swap.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { buildStory } from "@/lib/story";
import { ensureReferralCode, referralShareUrl } from "@/lib/growth/referrals";
import { StoryView } from "@/components/story/story-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Swapl story · swapl" };

export default async function StoryPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/story");

  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const [story, referralCode] = await Promise.all([
    buildStory(session.userId),
    ensureReferralCode(session.userId),
  ]);
  const referralUrl = referralShareUrl(referralCode);

  const empty = story.timeline.length === 0;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-10">
              <p className="kicker mb-3">swapl</p>
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t("story.title")}</h1>
              <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>{t("story.subtitle")}</p>
            </header>

            {empty ? (
              <div className="surface-card surface-card--static p-8 text-center">
                <h2 className="font-display text-2xl tracking-[-0.01em] mb-2">{t("story.empty.title")}</h2>
                <p className="text-sm max-w-md mx-auto" style={{ color: "var(--navy-2)" }}>
                  {t("story.empty.body")}
                </p>
                <Link href="/listings" className="pill-primary mt-6 inline-flex">
                  {t("story.empty.cta")}
                </Link>
              </div>
            ) : (
              <StoryView timeline={story.timeline} counts={story.counts} referralUrl={referralUrl} />
            )}
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
