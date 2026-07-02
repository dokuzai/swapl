"use client";

// Stay-with-Keys (DOK-155) — the NON-simultaneous booking mode that sits
// alongside "Propose a swap" on a listing. The guest picks dates, sees the
// Keys cost (nightlyKeys × nights) and their balance, and requests the stay.
// Keys are travel points: if the balance is short we say "host more to earn
// Keys" — never "buy". On success the host gets a pending request to confirm.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { type DayStatus, dayKey, toISODate } from "@/lib/listing/calendar-days";

const DAY_MS = 24 * 60 * 60 * 1000;

type Availability = {
  listingId: string;
  nightlyKeys: number;
  availableFrom: string;
  availableTo: string;
  minStayDays: number;
  maxStayDays: number;
  bookedRanges: { dateFrom: string; dateTo: string }[];
};

function nightsBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function StayWithKeys({ listingId, balance }: { listingId: string; balance: number }) {
  const t = useT();
  const router = useRouter();
  const [avail, setAvail] = useState<Availability | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Load availability + nightly Keys once on mount. The guest picks their dates
  // on the calendar below (which greys out every booked/blocked night), so we
  // don't pre-seed a range — an empty picker reads as "choose your nights".
  useEffect(() => {
    let alive = true;
    fetch(`/api/listings/${listingId}/keys-availability`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Availability | null) => {
        if (!alive || !d) return;
        setAvail(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [listingId]);

  // Calendar range pick: first tap sets check-in, second sets check-out. The
  // stored dateTo is the checkout day (exclusive), so a tap on day N as the end
  // books through the night of N. Only "available" days are clickable, so a
  // selection can never span a booked/blocked night.
  const onDayClick = useCallback(
    (date: Date, status: DayStatus) => {
      if (status !== "available") return;
      const iso = toISODate(date);
      setError(null);
      // No start yet, or restarting after a complete range → set check-in.
      if (!dateFrom || (dateFrom && dateTo)) {
        setDateFrom(iso);
        setDateTo("");
        return;
      }
      // Second tap: the checkout is the day AFTER the tapped night.
      const checkout = toISODate(new Date(date.getTime() + DAY_MS));
      if (new Date(checkout).getTime() <= new Date(dateFrom).getTime()) {
        // Tapped before/at check-in → treat as a new check-in.
        setDateFrom(iso);
        setDateTo("");
        return;
      }
      setDateTo(checkout);
    },
    [dateFrom, dateTo],
  );

  const selectionFor = useCallback(
    (date: Date): "start" | "end" | "in" | undefined => {
      if (!dateFrom) return undefined;
      const tms = date.getTime();
      const from = dayKey(dateFrom).getTime();
      // Render the inclusive last night (checkout − 1 day) as the end marker.
      const lastNight = dateTo ? dayKey(dateTo).getTime() - DAY_MS : from;
      if (tms === from) return "start";
      if (tms === lastNight && dateTo) return "end";
      if (tms > from && tms < lastNight) return "in";
      return undefined;
    },
    [dateFrom, dateTo],
  );

  const snapshot = useMemo(
    () =>
      avail
        ? {
            availableFrom: avail.availableFrom,
            availableTo: avail.availableTo,
            bookedRanges: avail.bookedRanges,
          }
        : null,
    [avail],
  );

  const nights = nightsBetween(dateFrom, dateTo);
  const cost = avail ? nights * avail.nightlyKeys : 0;
  const insufficient = cost > 0 && cost > balance;
  const shortBy = insufficient ? cost - balance : 0;
  // Live "≈ N nights" scale so the balance number means something at this rate.
  const balanceNights = avail && avail.nightlyKeys > 0 ? Math.floor(balance / avail.nightlyKeys) : 0;
  // How many nights of hosting would close the gap (rounded up).
  const hostNightsToCover = avail && avail.nightlyKeys > 0 ? Math.ceil(shortBy / avail.nightlyKeys) : 0;
  const outsideMinMax = avail !== null && nights > 0 && (nights < avail.minStayDays || nights > avail.maxStayDays);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nights <= 0) {
      setError(t("stay.keys.invalidRange"));
      return;
    }
    if (outsideMinMax && avail) {
      setError(t("stay.keys.minMax", { min: avail.minStayDays, max: avail.maxStayDays }));
      return;
    }
    if (insufficient) {
      setError(t("stay.keys.insufficient", { short: shortBy }));
      return;
    }
    start(async () => {
      const res = await fetch("/api/keys/stays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, dateFrom, dateTo }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (res.ok && j.ok) {
        setDone(true);
        router.refresh();
        return;
      }
      if (res.status === 422 && /enough/i.test(j.error ?? "")) {
        setError(t("stay.keys.insufficient", { short: Math.max(1, shortBy || cost - balance) }));
      } else if (
        res.status === 422 &&
        (j.code === "DATES_TAKEN" ||
          j.code === "OUTSIDE_AVAILABILITY" ||
          j.code === "BAD_DATES" ||
          j.code === "INACTIVE_LISTING")
      ) {
        setError(t("stay.keys.unavailable"));
      } else {
        setError(t("stay.keys.error"));
      }
    });
  }

  if (!avail) {
    return (
      <div className="text-sm" style={{ color: "var(--navy-3)" }}>
        {t("stay.keys.title")}…
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-sm rounded-xl p-4" style={{ background: "var(--pink-light)" }}>
        <p className="font-medium mb-2">{t("stay.keys.requested")}</p>
        <a href="/trips" className="font-medium" style={{ color: "var(--pink)" }}>
          {t("stay.keys.viewInTrips")} →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
          {t("stay.keys.title")} · {t("stay.keys.subtitle")}
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--navy-2)" }}>{t("stay.keys.body")}</p>
        {/* Swap-vs-Keys guidance — makes the choice obvious at first touch. */}
        <p className="text-[13px] mt-2" style={{ color: "var(--navy-3)" }}>{t("stay.keys.whenToUse")}</p>
      </div>

      <div
        className="rounded-xl border p-3"
        style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("stay.keys.perNight", { count: avail.nightlyKeys })}
          </span>
          <span className="font-display text-xl" style={{ color: "var(--pink)" }}>
            {avail.nightlyKeys}
          </span>
        </div>
        {/* What the rate means: cost here = what the host earns per night. */}
        <p className="text-[12px] mt-1.5" style={{ color: "var(--navy-3)" }}>{t("stay.keys.rateContext")}</p>
      </div>

      {/* Calendar picker: booked/blocked nights are greyed out and unclickable,
          so a guest can only assemble a genuinely free range (DOK-159). */}
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}>
        <div className="flex items-center justify-between mb-3 text-sm">
          <span style={{ color: "var(--navy-2)" }}>
            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              {t("stay.keys.from")}{" "}
            </span>
            {dateFrom ? new Date(dateFrom).toLocaleDateString() : "—"}
          </span>
          <span style={{ color: "var(--navy-2)" }}>
            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              {t("stay.keys.to")}{" "}
            </span>
            {dateTo ? new Date(dateTo).toLocaleDateString() : "—"}
          </span>
        </div>
        {snapshot && (
          <MonthCalendar
            snapshot={snapshot}
            onDayClick={onDayClick}
            selectionFor={selectionFor}
            monthsBound={{
              min: {
                year: dayKey(avail.availableFrom).getUTCFullYear(),
                month: dayKey(avail.availableFrom).getUTCMonth(),
              },
              max: {
                year: dayKey(avail.availableTo).getUTCFullYear(),
                month: dayKey(avail.availableTo).getUTCMonth(),
              },
            }}
          />
        )}
      </div>

      {nights > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--navy-2)" }}>{t("stay.keys.nights", { count: nights })}</span>
          <span className="font-medium">{t("stay.keys.cost", { count: cost })}</span>
        </div>
      )}

      <p className="font-mono text-[11px]" style={{ color: insufficient ? "var(--destructive)" : "var(--navy-3)" }}>
        {t("stay.keys.yourBalance", { count: balance })}
        {balanceNights > 0 && (
          <span style={{ color: "var(--navy-3)" }}> · {t("stay.keys.balanceScale", { count: balanceNights })}</span>
        )}
      </p>

      {insufficient && (
        <div className="text-sm rounded-lg p-3 space-y-2" style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}>
          <p>{t("stay.keys.insufficient", { short: shortBy })}</p>
          {hostNightsToCover > 0 && (
            <p style={{ color: "var(--navy-2)" }}>{t("stay.keys.insufficientAction", { nights: hostNightsToCover })}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <a href="/listings/new" className="pill-primary text-[13px]">
              {t("stay.keys.listHomeCta")}
            </a>
            <a href="/account/keys" className="inline-flex font-medium" style={{ color: "var(--pink)" }}>
              {t("stay.keys.earnLink")} →
            </a>
          </div>
        </div>
      )}
      {error && !insufficient && <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>}

      <button
        type="submit"
        className="pill-primary w-full justify-center"
        disabled={pending || nights <= 0 || insufficient || outsideMinMax}
      >
        {pending ? t("stay.keys.requesting") : t("stay.keys.request")}
      </button>

      <p className="font-mono text-[10px] uppercase tracking-[.08em] text-center" style={{ color: "var(--navy-3)" }}>
        {t("stay.keys.minMax", { min: avail.minStayDays, max: avail.maxStayDays })}
      </p>
    </form>
  );
}
