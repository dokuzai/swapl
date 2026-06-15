"use client";

// Host availability calendar editor (DOK-159).
//
// The owner's month view of their listing: agreements + Keys stays show as
// "booked" (read-only — they reflect real bookings), and the host can block /
// unblock their own dates (renovations, personal use) via POST/DELETE on
// /blocked-ranges. Blocks fold into the shared availability so a blocked date
// drops the listing out of date-filtered browse and greys out in every picker.
//
// Interaction: tap a free day to start a block selection, tap a second day to
// set the range, then "Block these dates". Tap an existing host block to
// remove it. Booked (agreement/Keys) days are not editable here.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import {
  type CalendarSnapshot,
  type DayStatus,
  dayKey,
  toISODate,
} from "@/lib/listing/calendar-days";

type CalendarResponse = CalendarSnapshot & {
  listingId: string;
  minStayDays: number;
  maxStayDays: number;
};

type HostBlock = { id: string; dateFrom: string; dateTo: string; note: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function CalendarEditor({ listingId }: { listingId: string }) {
  const t = useT();
  const [snap, setSnap] = useState<CalendarResponse | null>(null);
  const [blocks, setBlocks] = useState<HostBlock[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // In-progress block selection: first tap sets anchor, second sets the range.
  const [selStart, setSelStart] = useState<Date | null>(null);
  const [selEnd, setSelEnd] = useState<Date | null>(null);

  // Fetch the public calendar (window + occupied/blocked ranges, with sources)
  // and the owner-only block list (ids, for deletion). Returned as a plain
  // function so both the mount effect and the post-mutation refresh reuse it.
  const fetchState = useCallback(async (): Promise<{ snap: CalendarResponse | null; blocks: HostBlock[] }> => {
    const [calRes, blkRes] = await Promise.all([
      fetch(`/api/listings/${listingId}/calendar`),
      fetch(`/api/listings/${listingId}/blocked-ranges`),
    ]);
    const snap = calRes.ok ? ((await calRes.json()) as CalendarResponse) : null;
    const blocks = blkRes.ok ? ((await blkRes.json()) as { ranges: HostBlock[] }).ranges : [];
    return { snap, blocks };
  }, [listingId]);

  const reload = useCallback(async () => {
    const { snap, blocks } = await fetchState();
    if (snap) setSnap(snap);
    setBlocks(blocks);
  }, [fetchState]);

  useEffect(() => {
    let alive = true;
    fetchState()
      .then(({ snap, blocks }) => {
        if (!alive) return;
        if (snap) setSnap(snap);
        setBlocks(blocks);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetchState]);

  // Map a clicked block day back to its block id so we can DELETE it.
  const blockAt = useCallback(
    (day: Date): HostBlock | null => {
      const t0 = day.getTime();
      return (
        blocks.find((b) => t0 >= dayKey(b.dateFrom).getTime() && t0 < dayKey(b.dateTo).getTime()) ?? null
      );
    },
    [blocks],
  );

  // The selection range is half-open [start, end+1day) so a single-day click
  // still blocks one night. Normalised so dragging either direction works.
  const range = useMemo(() => {
    if (!selStart) return null;
    const a = selStart.getTime();
    const b = (selEnd ?? selStart).getTime();
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { from: new Date(lo), to: new Date(hi + DAY_MS) };
  }, [selStart, selEnd]);

  const selectionFor = useCallback(
    (date: Date): "start" | "end" | "in" | "block" | undefined => {
      if (!range) return undefined;
      const tms = date.getTime();
      if (tms === range.from.getTime()) return "start";
      if (tms === range.to.getTime() - DAY_MS) return "end";
      if (tms > range.from.getTime() && tms < range.to.getTime() - DAY_MS) return "in";
      return undefined;
    },
    [range],
  );

  function onDayClick(date: Date, status: DayStatus) {
    setError(null);
    if (status === "blocked") {
      // Tapping an existing block clears any pending selection and targets it.
      setSelStart(null);
      setSelEnd(null);
      const blk = blockAt(date);
      if (blk) void unblock(blk);
      return;
    }
    if (status !== "available") return; // booked days are read-only
    if (!selStart || (selStart && selEnd)) {
      setSelStart(date);
      setSelEnd(null);
    } else {
      setSelEnd(date);
    }
  }

  function unblock(blk: HostBlock) {
    start(async () => {
      const res = await fetch(`/api/listings/${listingId}/blocked-ranges`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeId: blk.id }),
      });
      if (!res.ok) {
        setError(t("calendar.editor.error"));
        return;
      }
      await reload();
    });
  }

  function blockSelection() {
    if (!range) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/listings/${listingId}/blocked-ranges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: toISODate(range.from), dateTo: toISODate(range.to) }),
      });
      if (!res.ok) {
        setError(t("calendar.editor.error"));
        return;
      }
      setSelStart(null);
      setSelEnd(null);
      await reload();
    });
  }

  function clearSelection() {
    setSelStart(null);
    setSelEnd(null);
    setError(null);
  }

  if (!snap) {
    return (
      <p className="text-sm" style={{ color: "var(--navy-3)" }}>
        {t("calendar.editor.loading")}
      </p>
    );
  }

  const selNights = range ? Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS) : 0;
  const winStart = dayKey(snap.availableFrom);
  const winEnd = dayKey(snap.availableTo);

  return (
    <div>
      <p className="kicker mb-3">{t("calendar.editor.kicker")}</p>
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-2">{t("calendar.editor.title")}</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
        {t("calendar.editor.intro")}
      </p>

      <div className="surface-card p-5 sm:p-6">
        <MonthCalendar
          snapshot={snap}
          onDayClick={onDayClick}
          selectionFor={selectionFor}
          monthsBound={{
            min: { year: winStart.getUTCFullYear(), month: winStart.getUTCMonth() },
            max: { year: winEnd.getUTCFullYear(), month: winEnd.getUTCMonth() },
          }}
        />
      </div>

      {/* Action bar: appears once the host has a pending block selection. */}
      {range ? (
        <div
          className="mt-4 rounded-xl border p-4 flex flex-wrap items-center gap-3"
          style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
        >
          <span className="text-sm" style={{ color: "var(--navy-2)" }}>
            {t("calendar.editor.selected", { count: selNights })}
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={clearSelection}
              disabled={pending}
              className="text-sm px-4 py-2 rounded-full border"
              style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            >
              {t("calendar.editor.cancel")}
            </button>
            <button type="button" onClick={blockSelection} disabled={pending} className="pill-primary text-sm">
              {pending ? t("calendar.editor.saving") : t("calendar.editor.block")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] mt-4" style={{ color: "var(--navy-3)" }}>
          {t("calendar.editor.hint")}
        </p>
      )}

      {error && (
        <p className="text-sm mt-3" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

      {/* Existing host blocks, listed for quick removal on touch. */}
      {blocks.length > 0 && (
        <div className="mt-8">
          <h2 className="font-mono text-[10px] uppercase tracking-[.12em] mb-3" style={{ color: "var(--navy-3)" }}>
            {t("calendar.editor.yourBlocks")}
          </h2>
          <ul className="space-y-2">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
                style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
              >
                <span className="text-sm">
                  {fmtRange(b.dateFrom, b.dateTo)}
                </span>
                <button
                  type="button"
                  onClick={() => unblock(b)}
                  disabled={pending}
                  className="font-mono text-[10px] uppercase tracking-[.08em] underline"
                  style={{ color: "var(--pink)" }}
                >
                  {t("calendar.editor.unblock")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// "15 Jun → 18 Jun" using the day boundaries; the checkout day is exclusive so
// we show the last blocked night (to − 1 day) as the end.
function fmtRange(fromISO: string, toISO: string): string {
  const from = dayKey(fromISO);
  const lastNight = new Date(dayKey(toISO).getTime() - DAY_MS);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return from.getTime() === lastNight.getTime() ? fmt(from) : `${fmt(from)} → ${fmt(lastNight)}`;
}
