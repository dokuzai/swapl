"use client";

// "Your Swapl story" — the interactive shell (DOK-158): headline counts, the
// share affordance (Web Share API w/ image, falling back to copy-link), and the
// year-grouped postcard timeline. Data is fetched server-side and passed in as
// props (StoryEvent[] / StoryCounts), so this stays free of any server imports
// — only `import type` from @/lib/story, which is erased at build (DOK-163).

import { useRef, useState, useTransition } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import type { StoryEvent, StoryCounts } from "@/lib/story";
import { StoryPostcard } from "./story-postcard";
import { StoryShareCardPreview, storyCardSvg, storyCardPng } from "./story-share-card";

export function StoryView({
  timeline,
  counts,
  referralUrl,
}: {
  timeline: StoryEvent[];
  counts: StoryCounts;
  referralUrl: string;
}) {
  const t = useT();
  const locale = useLocale();

  // Year buckets, newest-first (timeline already arrives date-desc).
  const byYear = groupByYear(timeline);

  const fmtRange = (from: string, to: string) => {
    const f = new Date(from);
    const tt = new Date(to);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${f.toLocaleDateString(locale, opts)} – ${tt.toLocaleDateString(locale, opts)}`;
  };

  const refDisplay = referralUrl.replace(/^https?:\/\//, "");

  const cardLabels = {
    trips: t("story.counts.trips"),
    hostings: t("story.counts.hostings"),
    cities: t("story.counts.cities"),
    countries: t("story.counts.countries"),
    tagline: t("story.share.cardTagline"),
    join: t("story.share.cardJoin"),
  };

  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashCopied() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      flashCopied();
    } catch {
      /* insecure context — nothing else to do */
    }
  }

  function share() {
    start(async () => {
      const text = t("story.share.text", {
        trips: counts.trips,
        hostings: counts.hostings,
        countries: counts.countries,
      });

      // Try sharing the rendered card as a file first (richest result, carries
      // the ?ref= link baked into the image); fall back to a link-only share,
      // then to copy.
      const svg = storyCardSvg(counts, refDisplay, cardLabels);
      const png = await storyCardPng(svg);
      if (png && typeof navigator.share === "function") {
        const file = new File([png], "swapl-story.png", { type: "image/png" });
        const data = { title: "swapl", text: `${text} `, url: referralUrl, files: [file] };
        if (!navigator.canShare || navigator.canShare(data)) {
          try {
            await navigator.share(data);
            return;
          } catch {
            /* cancelled or unsupported — fall through */
          }
        }
      }

      const linkData = { title: "swapl", text: `${text} `, url: referralUrl };
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(linkData))) {
        try {
          await navigator.share(linkData);
          return;
        } catch {
          /* cancelled — fall through to copy */
        }
      }
      await copyLink();
    });
  }

  return (
    <div className="space-y-12">
      {/* ---- Counts ---- */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CountCard value={counts.trips} label={t("story.counts.trips")} accent />
          <CountCard value={counts.hostings} label={t("story.counts.hostings")} />
          <CountCard value={counts.cities} label={t("story.counts.cities")} />
          <CountCard value={counts.countries} label={t("story.counts.countries")} />
        </div>
      </section>

      {/* ---- Share ---- */}
      <section className="surface-card surface-card--static p-6">
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("story.share.title")}</h2>
        <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("story.share.body")}</p>

        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr] md:items-center">
          <StoryShareCardPreview counts={counts} refDisplay={refDisplay} labels={cardLabels} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={share}
              disabled={pending}
              className="pill-primary w-full justify-center text-center py-3"
            >
              {pending ? t("story.share.sharing") : t("story.share.cta")}
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="pill-ghost w-full justify-center text-center py-3"
              aria-live="polite"
            >
              {copied ? t("story.share.copied") : t("story.share.copy")}
            </button>
            <p className="mt-1 text-center font-mono text-[12px] break-all" style={{ color: "var(--navy-3)" }}>
              {refDisplay}
            </p>
          </div>
        </div>
      </section>

      {/* ---- Timeline ---- */}
      <section>
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-6">{t("story.timeline.heading")}</h2>
        <div className="space-y-10">
          {byYear.map(([year, events]) => (
            <div key={year}>
              <h3
                className="font-mono text-[12px] uppercase tracking-[.14em] mb-4"
                style={{ color: "var(--navy-3)" }}
              >
                {year}
              </h3>
              <div className="flex flex-wrap gap-5">
                {events.map((e, i) => (
                  <StoryPostcard
                    key={`${year}-${i}`}
                    kind={e.kind}
                    city={e.city}
                    country={e.country}
                    year={e.year}
                    dateRange={fmtRange(e.dateFrom, e.dateTo)}
                    kindLabel={e.kind === "trip" ? t("story.stamp.trip") : t("story.stamp.hosting")}
                    counterpart={counterpartLine(e, t)}
                    tilt={(i % 3) - 1}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CountCard({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div
      className="surface-card surface-card--static p-5 text-center"
      style={accent ? { background: "var(--pink-light)" } : undefined}
    >
      <div
        className="font-display text-4xl leading-none"
        style={{ color: accent ? "var(--pink)" : "var(--navy)" }}
      >
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
        {label}
      </div>
    </div>
  );
}

function counterpartLine(e: StoryEvent, t: ReturnType<typeof useT>): string {
  if (e.counterpartName) {
    return e.kind === "trip"
      ? t("story.event.tripWith", { name: e.counterpartName })
      : t("story.event.hostingWith", { name: e.counterpartName });
  }
  return e.kind === "trip" ? t("story.event.trip") : t("story.event.hosting");
}

function groupByYear(timeline: StoryEvent[]): [number, StoryEvent[]][] {
  const map = new Map<number, StoryEvent[]>();
  for (const e of timeline) {
    const bucket = map.get(e.year);
    if (bucket) bucket.push(e);
    else map.set(e.year, [e]);
  }
  // timeline is date-desc, so insertion order already yields newest year first.
  return Array.from(map.entries());
}
