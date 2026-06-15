"use client";

// Stay-with-Keys (DOK-155) — the NON-simultaneous booking mode that sits
// alongside "Propose a swap" on a listing. The guest picks dates, sees the
// Keys cost (nightlyKeys × nights) and their balance, and requests the stay.
// Keys are travel points: if the balance is short we say "host more to earn
// Keys" — never "buy". On success the host gets a pending request to confirm.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

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

  // Load availability + nightly Keys once on mount, and seed the date inputs
  // to the earliest valid stay within the window.
  useEffect(() => {
    let alive = true;
    fetch(`/api/listings/${listingId}/keys-availability`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Availability | null) => {
        if (!alive || !d) return;
        setAvail(d);
        const from = new Date(d.availableFrom);
        const to = new Date(from.getTime() + d.minStayDays * 24 * 60 * 60 * 1000);
        const cap = new Date(d.availableTo);
        const end = to <= cap ? to : cap;
        setDateFrom(from.toISOString().slice(0, 10));
        setDateTo(end.toISOString().slice(0, 10));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [listingId]);

  const nights = nightsBetween(dateFrom, dateTo);
  const cost = avail ? nights * avail.nightlyKeys : 0;
  const insufficient = cost > 0 && cost > balance;
  const shortBy = insufficient ? cost - balance : 0;
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

  const labelCls = "block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]";
  const inputCls = "w-full px-3 py-2.5 rounded-lg border outline-none text-sm";
  const inputStyle = { borderColor: "var(--line)", background: "var(--card-bg)" } as const;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
          {t("stay.keys.title")} · {t("stay.keys.subtitle")}
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--navy-2)" }}>{t("stay.keys.body")}</p>
      </div>

      <div
        className="flex items-baseline justify-between rounded-xl border p-3"
        style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("stay.keys.perNight", { count: avail.nightlyKeys })}
        </span>
        <span className="font-display text-xl" style={{ color: "var(--pink)" }}>
          {avail.nightlyKeys}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls} style={{ color: "var(--navy-3)" }}>{t("stay.keys.from")}</span>
          <input
            type="date"
            required
            value={dateFrom}
            min={avail.availableFrom.slice(0, 10)}
            max={avail.availableTo.slice(0, 10)}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span className={labelCls} style={{ color: "var(--navy-3)" }}>{t("stay.keys.to")}</span>
          <input
            type="date"
            required
            value={dateTo}
            min={dateFrom || avail.availableFrom.slice(0, 10)}
            max={avail.availableTo.slice(0, 10)}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </label>
      </div>

      {nights > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--navy-2)" }}>{t("stay.keys.nights", { count: nights })}</span>
          <span className="font-medium">{t("stay.keys.cost", { count: cost })}</span>
        </div>
      )}

      <p className="font-mono text-[11px]" style={{ color: insufficient ? "#dc2626" : "var(--navy-3)" }}>
        {t("stay.keys.yourBalance", { count: balance })}
      </p>

      {insufficient && (
        <div className="text-sm rounded-lg p-3 space-y-2" style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}>
          <p>{t("stay.keys.insufficient", { short: shortBy })}</p>
          <a href="/account/keys" className="inline-flex font-medium" style={{ color: "var(--pink)" }}>
            {t("stay.keys.earnLink")} →
          </a>
        </div>
      )}
      {error && !insufficient && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}

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
