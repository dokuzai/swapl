// Public host profile (DOK-147) — Airbnb-inspired layout in swapl's postcard
// design language. Identity card + real stats (completed swaps, reviews,
// tenure), icon info rows, "Where I've been" postcard stamps from COMPLETED
// agreements, and the latest reviews. Mirrors GET /api/profiles/{id}.

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ListingCard } from "@/components/listing/listing-card";
import { CityStamp } from "@/components/profile/city-stamp";
import { toDTO } from "@/lib/listing-utils";
import { parseInterests, INTEREST_CATEGORIES } from "@/lib/interests";
import { parseSettings } from "@/lib/settings";
import { parseJSON } from "@/lib/db";
import { getI18n, t as tt, type Dict } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

export const dynamic = "force-dynamic";

export default async function ProfilePage(props: PageProps<"/profile/[id]">) {
  const { id } = await props.params;
  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      listings: {
        where: { isActive: true },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  // Moderation parity with the API: suspended hosts are hidden.
  if (!user || user.suspendedAt) notFound();

  const settings = parseSettings(user.settings);
  const languages = parseJSON<string[]>(user.languages, []);

  const [completedAgreements, reviews] = await Promise.all([
    prisma.swapAgreement.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ listing1: { userId: id } }, { listing2: { userId: id } }],
      },
      select: {
        dateTo: true,
        listing1: { select: { userId: true, city: true, country: true } },
        listing2: { select: { userId: true, city: true, country: true } },
      },
      orderBy: { dateTo: "desc" },
    }),
    prisma.swapReview.findMany({
      // Hidden (moderated) reviews never reach the public page (DOK-149).
      where: { subjectId: id, status: "published" },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Visited cities, deduped per (city, country, year), newest first — the
  // other listing in each completed agreement is the one this host stayed in.
  const seen = new Set<string>();
  const visited: { city: string; country: string; year: number }[] = [];
  for (const a of completedAgreements) {
    const other = a.listing1.userId === id ? a.listing2 : a.listing1;
    const year = a.dateTo.getFullYear();
    const key = `${other.city}|${other.country}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visited.push({ city: other.city, country: other.country, year });
  }

  const name = user.name ?? user.email.split("@")[0];
  const homeCity = settings.showHomeCity ? user.homeCity : null;
  const homeCountry = settings.showHomeCity ? user.homeCountry : null;
  const avgRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null;

  // Tenure: whole years on swapl, falling back to months for new members.
  const monthsOn = Math.max(
    0,
    Math.floor((Date.now() - user.createdAt.getTime()) / (30.44 * 24 * 60 * 60 * 1000)),
  );
  const yearsOn = Math.floor(monthsOn / 12);
  const tenure =
    yearsOn >= 1
      ? { value: yearsOn, label: t("profile.stats.yearsOn") }
      : { value: monthsOn, label: t("profile.stats.monthsOn") };

  const interests = parseInterests(user.interests);
  const grouped = new Map<string, typeof interests>();
  for (const tag of interests) {
    const arr = grouped.get(tag.category) ?? [];
    arr.push(tag);
    grouped.set(tag.category, arr);
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-5xl">
          {/* ---- Identity card + stats ---- */}
          <section className="surface-card surface-card--static p-6 sm:p-8 mb-8">
            <div className="grid gap-8 sm:grid-cols-[1fr_auto]">
              <div className="flex items-center gap-5 sm:gap-7">
                <Avatar name={name} avatar={user.avatar} />
                <div>
                  <p className="kicker mb-2">
                    {t("profile.memberSince", {
                      date: user.createdAt.toLocaleDateString(locale, { month: "long", year: "numeric" }),
                    })}
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl tracking-[-0.02em] leading-[1.05] font-medium">
                    {name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {homeCity && (
                      <span className="text-sm" style={{ color: "var(--navy-2)" }}>
                        {homeCity}
                        {homeCountry ? `, ${homeCountry}` : ""}
                      </span>
                    )}
                    {user.verified && (
                      <span className="match-badge" style={{ background: "var(--navy)", color: "var(--cream)" }}>
                        ✓ {t("profile.verified")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats column — real numbers from the DB, Airbnb-style stack. */}
              <dl
                className="flex sm:flex-col gap-6 sm:gap-3 sm:pl-8 sm:border-l border-t sm:border-t-0 pt-5 sm:pt-0"
                style={{ borderColor: "var(--line)" }}
              >
                <Stat value={String(completedAgreements.length)} label={t("profile.stats.swaps")} />
                <Stat
                  value={avgRating != null ? `${reviews.length} · ${avgRating}★` : String(reviews.length)}
                  label={t("profile.stats.reviews")}
                />
                <Stat value={String(tenure.value)} label={tenure.label} />
              </dl>
            </div>

            {/* ---- Info rows ---- */}
            {(user.work || languages.length > 0 || homeCity) && (
              <div className="mt-7 pt-6 divider-dashed space-y-3">
                {user.work && <InfoRow icon="work" text={t("profile.work", { work: user.work })} />}
                {languages.length > 0 && (
                  <InfoRow icon="speech" text={t("profile.speaks", { languages: languages.join(", ") })} />
                )}
                {homeCity && <InfoRow icon="home" text={t("profile.livesIn", { city: homeCity })} />}
              </div>
            )}
          </section>

          {/* ---- About ---- */}
          {(user.bioVibe || user.bio) && (
            <section className="mb-10">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-3">
                {t("profile.about", { name })}
              </h2>
              {user.bioVibe && (
                <p className="max-w-2xl font-display italic text-[20px]" style={{ color: "var(--navy)" }}>
                  &ldquo;{user.bioVibe}&rdquo;
                </p>
              )}
              {user.bio && (
                <p className="mt-3 max-w-2xl text-[16px]" style={{ color: "var(--navy-2)" }}>
                  {user.bio}
                </p>
              )}
            </section>
          )}

          {/* ---- Where I've been: postcard stamps (empty state when none) ---- */}
          <section className="mb-10">
            <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">
              {t("profile.whereIveBeen")}
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
              {t("profile.whereIveBeenLede")}
            </p>
            {visited.length === 0 ? (
              <div className="surface-card surface-card--static p-8 text-center text-sm" style={{ color: "var(--navy-2)" }}>
                {t("profile.noStamps")}
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
                {visited.map((v, i) => (
                  <CityStamp
                    key={`${v.city}-${v.year}`}
                    city={v.city}
                    country={v.country}
                    year={v.year}
                    tilt={[-2, 1.5, -1, 2][i % 4]}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ---- Interests ---- */}
          {interests.length > 0 && (
            <section className="mb-10">
              <p className="kicker mb-3">{t("profile.interestsTitle")}</p>
              <div className="surface-card surface-card--static p-6 space-y-4">
                {INTEREST_CATEGORIES.map((cat) => {
                  const items = grouped.get(cat.id);
                  if (!items?.length) return null;
                  return (
                    <div key={cat.id}>
                      <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
                        {cat.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {items.map((tag) => (
                          <span key={tag.slug} className="tag-chip" style={{ background: "var(--pink-light)", color: "var(--navy)" }}>
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---- Reviews ---- */}
          <section className="mb-10">
            <h2 className="font-display text-2xl tracking-[-0.01em] mb-4">
              {t("profile.reviewsTitle")}
              {avgRating != null && (
                <span className="ml-3 font-mono text-sm align-middle" style={{ color: "var(--navy-3)" }}>
                  ★ {avgRating} · {reviews.length}
                </span>
              )}
            </h2>
            {reviews.length === 0 ? (
              <div className="surface-card surface-card--static p-8 text-center text-sm" style={{ color: "var(--navy-2)" }}>
                {t("profile.noReviews")}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {reviews.map((r) => (
                  <article key={r.id} className="surface-card surface-card--static p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar name={r.author.name ?? "?"} avatar={r.author.avatar} size={40} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.author.name ?? "swapl host"}</p>
                        <p className="text-xs" style={{ color: "var(--navy-3)" }}>
                          {relativeDate(r.createdAt, locale)}
                        </p>
                      </div>
                      <span className="ml-auto font-mono text-[13px] tracking-[.1em] whitespace-nowrap" aria-label={`${r.rating}/5`}>
                        <span style={{ color: "var(--pink)" }}>{"★".repeat(r.rating)}</span>
                        <span style={{ color: "var(--cream-2)" }}>{"★".repeat(5 - r.rating)}</span>
                      </span>
                    </div>
                    <p className="text-[14px] leading-[1.6]" style={{ color: "var(--navy-2)" }}>
                      {r.text}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ---- Listings ---- */}
          <section>
            <h2 className="font-display text-2xl tracking-[-0.01em] mb-4">
              {user.listings.length === 1 ? t("profile.theirHome") : t("profile.theirHomes")}
            </h2>
            {user.listings.length === 0 ? (
              <div className="surface-card surface-card--static p-10 text-center" style={{ color: "var(--navy-2)" }}>
                {t("profile.noListings")}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {user.listings.map((l) => (
                  <ListingCard key={l.id} listing={toDTO(l)} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-10">
            <Link href="/listings" className="pill-ghost">{t("profile.backToListings")}</Link>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

// ---------- Presentational helpers ----------

function Avatar({ name, avatar, size = 88 }: { name: string; avatar: string | null; size?: number }) {
  return avatar ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={avatar}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: "2px solid var(--line)" }}
    />
  ) : (
    <div
      className="rounded-full flex items-center justify-center font-display font-medium shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: "var(--navy)",
        color: "var(--cream)",
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <dt className="order-2 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
        {label}
      </dt>
      <dd className="order-1 font-display text-2xl tracking-[-0.01em] font-medium leading-none mb-1">
        {value}
      </dd>
    </div>
  );
}

function InfoRow({ icon, text }: { icon: "work" | "speech" | "home"; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm" style={{ color: "var(--navy-2)" }}>
      <span aria-hidden style={{ color: "var(--navy-3)" }}>
        <RowIcon kind={icon} />
      </span>
      {text}
    </div>
  );
}

function RowIcon({ kind }: { kind: "work" | "speech" | "home" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "work") {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }
  if (kind === "speech") {
    return (
      <svg {...common}>
        <path d="M21 12a8 8 0 1 0-3.1 6.3L21 19l-.8-3.1A8 8 0 0 0 21 12Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v9h14v-9" />
    </svg>
  );
}

// Relative date for reviews — locale-aware via Intl, no dict keys needed.
function relativeDate(d: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days > -30) return rtf.format(days, "day");
  if (days > -365) return rtf.format(Math.round(days / 30.44), "month");
  return rtf.format(Math.round(days / 365.25), "year");
}
