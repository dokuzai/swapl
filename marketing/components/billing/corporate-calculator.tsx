"use client";

import { useMemo, useState, useTransition } from "react";

const PRICE_PER_SEAT = 199; // EUR/year
const SERVICED_NIGHT = 180;
const NIGHTS_PER_TRIP = 30;
const TRIPS_PER_YEAR = 4;

export function CorporateCalculator({ showCheckout }: { showCheckout?: boolean }) {
  const [seats, setSeats] = useState(10);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const swaplCost = seats * PRICE_PER_SEAT;
  const servicedCost = seats * SERVICED_NIGHT * NIGHTS_PER_TRIP * TRIPS_PER_YEAR;
  const savings = useMemo(() => Math.max(0, servicedCost - swaplCost), [servicedCost, swaplCost]);

  function checkout(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (seats < 5) {
      setError("Minimum 5 seats.");
      return;
    }
    start(async () => {
      const res = await fetch("/api/corporate/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, email, seatCount: seats }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else if (res.status === 503) {
        setError("Checkout opens at launch. Use the lead form below and we'll set you up manually.");
      } else {
        setError(j.error ?? "Couldn't open checkout.");
      }
    });
  }

  return (
    <div className="surface-card p-6">
      <label className="block text-sm mb-3">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
          Seats · {seats}
        </span>
        <input
          type="range"
          min={5}
          max={250}
          value={seats}
          onChange={(e) => setSeats(+e.target.value)}
          className="w-full"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Stat label="swapl annual" value={`€${swaplCost.toLocaleString()}`} accent />
        <Stat label="Estimated savings vs. serviced" value={`€${savings.toLocaleString()}`} />
      </div>

      {showCheckout && (
        <form onSubmit={checkout} className="space-y-3 pt-3 divider-dashed">
          <label className="block text-sm">
            <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
              Company name
            </span>
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border outline-none"
              style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            />
          </label>
          <label className="block text-sm">
            <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
              Billing email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border outline-none"
              style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            />
          </label>
          {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
          <button type="submit" disabled={pending} className="pill-primary w-full justify-center">
            {pending ? "Loading…" : `Buy ${seats} seats — €${swaplCost.toLocaleString()}/year`}
          </button>
        </form>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: accent ? "var(--pink-light)" : "var(--cream-2)" }}>
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>{label}</div>
      <div className="font-display text-2xl" style={{ color: accent ? "var(--pink)" : "var(--navy)" }}>{value}</div>
    </div>
  );
}
