"use client";

// Apple-style date-of-birth picker (DOK-219). A focused modal that pairs a
// month grid with a scroll wheel for month + year — the same two-mode flow
// iOS uses for picking a birthday — but rendered in Swapl's own light palette
// (cream/navy/pink) and fonts rather than the system dark sheet.
//
// One source of truth: `selected` {y,m,d}. Every interaction (day tap, month
// arrows, wheel scroll) moves it; the calendar header toggles between the grid
// and the wheel. Confirm emits an ISO calendar date ("YYYY-MM-DD"); the caller
// owns persistence. Value is treated as a pure calendar date (no timezone).

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/client";

type YMD = { y: number; m: number; d: number };

const ITEM = 40; // wheel row height (px)
const VISIBLE = 5; // odd, so one row sits dead-centre

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

// Monday-first weekday index (0 = Mon … 6 = Sun) for the 1st of a month.
function firstWeekdayMon(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

function parse(value: string | null): YMD {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return { y, m: m - 1, d };
  }
  // No value yet → a sensible adult default (Jan 1, 25 years ago).
  return { y: new Date().getFullYear() - 25, m: 0, d: 1 };
}

function toISO({ y, m, d }: YMD): string {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function DatePickerSheet({
  open,
  value,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  value: string | null;
  onConfirm: (iso: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  // State is seeded once from `value` on mount. The parent mounts this fresh on
  // each open (see PersonalInfoEditor), so a cancelled edit never leaks forward
  // and we avoid re-seeding via an effect.
  const [sel, setSel] = useState<YMD>(() => parse(value));
  const [mode, setMode] = useState<"calendar" | "wheel">("calendar");

  // Esc to cancel + lock background scroll while the modal is up.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  const setMonth = useCallback((y: number, m: number) => {
    setSel((s) => ({ y, m, d: Math.min(s.d, daysInMonth(y, m)) }));
  }, []);

  if (!open) return null;

  const selectedDate = new Date(sel.y, sel.m, sel.d);
  const longDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
    selectedDate,
  );
  const monthYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(sel.y, sel.m, 1),
  );

  function shiftMonth(delta: number) {
    const base = new Date(sel.y, sel.m + delta, 1);
    setMonth(base.getFullYear(), base.getMonth());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("account.personal.dob")}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "color-mix(in oklab, var(--navy) 45%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full sm:max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        {/* Chrome: cancel (×) and confirm (✓) — circular, like the iOS sheet. */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("account.dob.cancel")}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full"
            style={{ background: "var(--card-bg)", border: "1px solid var(--line)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onConfirm(toISO(sel))}
            aria-label={t("account.dob.done")}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full"
            style={{ background: "var(--pink)", color: "#fff" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3.5 9.5l3.5 3.5 7.5-8" />
            </svg>
          </button>
        </div>

        {/* Selected-date summary row. */}
        <div
          className="surface-card surface-card--static flex items-center justify-between gap-4 px-5 py-4 mb-3"
        >
          <span className="text-sm font-medium">{t("account.personal.dob")}</span>
          <span className="text-sm" style={{ color: "var(--navy-3)" }}>{longDate}</span>
        </div>

        {/* Picker card. */}
        <div className="surface-card surface-card--static p-5 rounded-t-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setMode((m) => (m === "calendar" ? "wheel" : "calendar"))}
              aria-label={t("account.dob.pickMonthYear")}
              className="inline-flex items-center gap-1.5 font-display text-lg tracking-[-0.01em]"
              style={{ color: "var(--pink)" }}
            >
              {monthYear}
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                style={{ transform: mode === "wheel" ? "rotate(180deg)" : "none", transition: "transform .2s" }}
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>

            {mode === "calendar" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label={t("account.dob.prevMonth")}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ color: "var(--pink)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 4l-4 4 4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label={t("account.dob.nextMonth")}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ color: "var(--pink)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {mode === "calendar" ? (
            <CalendarGrid locale={locale} sel={sel} onPick={(d) => setSel((s) => ({ ...s, d }))} />
          ) : (
            <MonthYearWheel locale={locale} sel={sel} onChange={setMonth} />
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({
  locale,
  sel,
  onPick,
}: {
  locale: string;
  sel: YMD;
  onPick: (day: number) => void;
}) {
  // Localized Mon-first weekday initials.
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const ref = new Date(2024, 0, 1 + i); // Jan 1 2024 is a Monday
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(ref);
  });
  const lead = firstWeekdayMon(sel.y, sel.m);
  const total = daysInMonth(sel.y, sel.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className="text-center font-mono text-[10px] uppercase tracking-[.06em] py-1"
            style={{ color: "var(--navy-3)" }}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const isSel = day === sel.d;
          return (
            <div key={day} className="flex justify-center">
              <button
                type="button"
                onClick={() => onPick(day)}
                aria-pressed={isSel}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm transition-colors"
                style={
                  isSel
                    ? { background: "var(--pink)", color: "#fff", fontWeight: 600 }
                    : { color: "var(--navy)" }
                }
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthYearWheel({
  locale,
  sel,
  onChange,
}: {
  locale: string;
  sel: YMD;
  onChange: (y: number, m: number) => void;
}) {
  const months = Array.from({ length: 12 }, (_, m) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, m, 1)),
  );
  const thisYear = new Date().getFullYear();
  const minYear = thisYear - 120;
  const maxYear = thisYear - 13; // must be at least 13 (matches the API bound)
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const yearIdx = Math.max(0, years.indexOf(sel.y));

  return (
    <div className="relative" style={{ height: ITEM * VISIBLE }}>
      {/* centre highlight band */}
      <div
        aria-hidden
        className="absolute left-2 right-2 rounded-full pointer-events-none"
        style={{ top: ITEM * 2, height: ITEM, background: "var(--cream-2)" }}
      />
      <div className="relative grid grid-cols-2">
        <WheelColumn
          items={months}
          index={sel.m}
          onIndex={(m) => onChange(sel.y, m)}
          align="end"
        />
        <WheelColumn
          items={years.map(String)}
          index={yearIdx}
          onIndex={(i) => onChange(years[i], sel.m)}
          align="start"
        />
      </div>
    </div>
  );
}

function WheelColumn({
  items,
  index,
  onIndex,
  align,
}: {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
  align: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the column scrolled to the selected row when it changes from outside.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = index * ITEM;
    if (Math.abs(el.scrollTop - top) > 1) {
      programmatic.current = true;
      el.scrollTo({ top, behavior: "auto" });
      requestAnimationFrame(() => {
        programmatic.current = false;
      });
    }
  }, [index]);

  function onScroll() {
    if (programmatic.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onIndex(i);
      else el.scrollTo({ top: i * ITEM, behavior: "smooth" }); // re-snap drift
    }, 110);
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="hide-scrollbar overflow-y-scroll snap-y snap-mandatory"
      style={{ height: ITEM * VISIBLE, scrollSnapType: "y mandatory" }}
    >
      <div style={{ height: ITEM * 2 }} />
      {items.map((label, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onIndex(i)}
          className="block w-full snap-center leading-none"
          style={{
            height: ITEM,
            scrollSnapAlign: "center",
            paddingInline: 16,
            textAlign: align === "end" ? "end" : "start",
            fontSize: i === index ? 22 : 18,
            fontWeight: i === index ? 600 : 400,
            color: i === index ? "var(--navy)" : "var(--navy-3)",
            opacity: i === index ? 1 : 0.5,
            transition: "opacity .15s, font-size .15s",
          }}
        >
          {label}
        </button>
      ))}
      <div style={{ height: ITEM * 2 }} />
    </div>
  );
}
