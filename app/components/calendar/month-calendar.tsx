"use client";

// Shared month-grid calendar (DOK-159).
//
// One presentational primitive used by both the host availability editor and
// the browse / Stay-with-Keys date pickers. It renders a Monday-first month,
// colours each day by status (available / booked / blocked / outside / past)
// via the shared lib/listing/calendar-days helper, and exposes a single
// onDayClick. Selection state (range, blocking) lives in the parent — this
// component is stateless apart from which month is on screen. Month and
// weekday names are localized through Intl using the active locale.

import { useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import {
  type CalendarSnapshot,
  type DayStatus,
  dayKey,
  dayStatus,
  monthGrid,
  todayUTC,
  utcDay,
} from "@/lib/listing/calendar-days";

const STATUS_STYLE: Record<DayStatus, { bg: string; color: string; border?: string }> = {
  available: { bg: "var(--card-bg)", color: "var(--navy)", border: "var(--line)" },
  booked: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" }, // amber: swap/Keys
  blocked: { bg: "var(--navy)", color: "var(--cream)", border: "var(--navy)" }, // host block
  outside: { bg: "transparent", color: "var(--navy-3)" },
  past: { bg: "transparent", color: "var(--navy-3)" },
};

export type DayRender = {
  date: Date;
  status: DayStatus;
  inMonth: boolean;
  // Parent-supplied selection overlay (range endpoints, in-range, pending block).
  selected?: "start" | "end" | "in" | "block";
};

export function MonthCalendar({
  snapshot,
  initialMonth,
  onDayClick,
  selectionFor,
  monthsBound,
  legend = true,
}: {
  snapshot: CalendarSnapshot;
  // Y/M to open on; defaults to the window start (or this month if later).
  initialMonth?: { year: number; month: number };
  onDayClick?: (date: Date, status: DayStatus) => void;
  // Parent decides the selection overlay class for a given day.
  selectionFor?: (date: Date, status: DayStatus) => DayRender["selected"];
  // Optional clamp on month navigation, e.g. don't page before the window.
  monthsBound?: { min?: { year: number; month: number }; max?: { year: number; month: number } };
  legend?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const today = useMemo(() => todayUTC(), []);

  const winFrom = dayKey(snapshot.availableFrom);
  const start = initialMonth ?? clampToToday(winFrom, today);
  const [cursor, setCursor] = useState<{ year: number; month: number }>(start);

  const cells = useMemo(() => {
    const grid = monthGrid(cursor.year, cursor.month);
    return grid.map<DayRender>(({ date, inMonth }) => {
      const status = dayStatus(date, snapshot, today);
      return { date, status, inMonth, selected: selectionFor?.(date, status) };
    });
  }, [cursor, snapshot, today, selectionFor]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        utcDay(cursor.year, cursor.month, 1),
      ),
    [cursor, locale],
  );

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    // 2024-01-01 was a Monday — gives us a Monday-first header row.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [locale]);

  const canPrev = withinBound({ ...cursor, delta: -1 }, monthsBound, "min");
  const canNext = withinBound({ ...cursor, delta: 1 }, monthsBound, "max");

  function step(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!canPrev}
          aria-label={t("calendar.prevMonth")}
          className="h-8 w-8 rounded-full border flex items-center justify-center disabled:opacity-30"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        >
          ‹
        </button>
        <span className="font-display text-base tracking-[-0.01em] capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canNext}
          aria-label={t("calendar.nextMonth")}
          className="h-8 w-8 rounded-full border flex items-center justify-center disabled:opacity-30"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className="text-center font-mono text-[9px] uppercase tracking-[.06em] py-1"
            style={{ color: "var(--navy-3)" }}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <DayCell key={i} cell={cell} onClick={onDayClick} unavailableLabel={t("calendar.dayUnavailable")} />
        ))}
      </div>

      {legend && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
          <LegendDot styleKey="available" label={t("calendar.legend.available")} />
          <LegendDot styleKey="booked" label={t("calendar.legend.booked")} />
          <LegendDot styleKey="blocked" label={t("calendar.legend.blocked")} />
        </div>
      )}
    </div>
  );
}

function DayCell({
  cell,
  onClick,
  unavailableLabel,
}: {
  cell: DayRender;
  onClick?: (date: Date, status: DayStatus) => void;
  unavailableLabel: string;
}) {
  const { date, status, inMonth, selected } = cell;
  const base = STATUS_STYLE[status];
  const isInteractive = !!onClick && status !== "past" && status !== "outside";
  const day = date.getUTCDate();

  // Selection overlay wins visually over the base status colour.
  const sel = selected;
  let bg = base.bg;
  let color = base.color;
  let border = base.border ?? "transparent";
  let ring = false;
  if (sel === "start" || sel === "end") {
    bg = "var(--pink)";
    color = "#fff";
    border = "var(--pink)";
  } else if (sel === "in") {
    bg = "var(--pink-light)";
    color = "var(--navy)";
    border = "var(--pink-light)";
  } else if (sel === "block") {
    bg = "var(--navy)";
    color = "var(--cream)";
    border = "var(--navy)";
    ring = true;
  }

  const unavailable = status === "booked" || status === "blocked" || status === "outside";

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={isInteractive ? () => onClick!(date, status) : undefined}
      aria-label={unavailable ? `${day} · ${unavailableLabel}` : String(day)}
      aria-disabled={!isInteractive}
      className="aspect-square rounded-lg text-[13px] flex items-center justify-center transition-colors relative"
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        opacity: !inMonth ? 0.35 : status === "past" ? 0.4 : 1,
        cursor: isInteractive ? "pointer" : "default",
        outline: ring ? "2px solid var(--pink)" : undefined,
        outlineOffset: ring ? "-3px" : undefined,
      }}
    >
      {day}
      {(status === "booked" || status === "blocked") && (
        <span
          className="absolute bottom-1 h-1 w-1 rounded-full"
          style={{ background: status === "blocked" ? "var(--cream)" : "#92400e" }}
        />
      )}
    </button>
  );
}

function LegendDot({ styleKey, label }: { styleKey: DayStatus; label: string }) {
  const s = STATUS_STYLE[styleKey];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--navy-2)" }}>
      <span
        className="h-3 w-3 rounded"
        style={{ background: s.bg === "transparent" ? "var(--card-bg)" : s.bg, border: `1px solid ${s.border ?? "var(--line)"}` }}
      />
      {label}
    </span>
  );
}

// --- month bound helpers -------------------------------------------------

function clampToToday(winFrom: Date, today: Date): { year: number; month: number } {
  const ref = winFrom.getTime() > today.getTime() ? winFrom : today;
  return { year: ref.getUTCFullYear(), month: ref.getUTCMonth() };
}

function withinBound(
  next: { year: number; month: number; delta: number },
  bound: { min?: { year: number; month: number }; max?: { year: number; month: number } } | undefined,
  which: "min" | "max",
): boolean {
  if (!bound) return true;
  const limit = bound[which];
  if (!limit) return true;
  const target = new Date(Date.UTC(next.year, next.month + next.delta, 1)).getTime();
  const edge = new Date(Date.UTC(limit.year, limit.month, 1)).getTime();
  return which === "min" ? target >= edge : target <= edge;
}
