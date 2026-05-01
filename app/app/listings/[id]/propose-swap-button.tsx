"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ListingDTO } from "@/lib/listing-utils";
import { CityIllust, SwapArrows } from "@/components/illustrations";
import { UpgradeRequiredModal } from "@/components/billing/upgrade-required-modal";

export default function ProposeSwapButton({
  proposerListing,
  targetListing,
}: {
  proposerListing: ListingDTO;
  targetListing: ListingDTO;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Default proposed dates = overlap of the two windows.
  const overlapFrom = new Date(
    Math.max(new Date(proposerListing.availableFrom).getTime(), new Date(targetListing.availableFrom).getTime())
  );
  const overlapTo = new Date(
    Math.min(new Date(proposerListing.availableTo).getTime(), new Date(targetListing.availableTo).getTime())
  );
  const initialFrom = overlapFrom <= overlapTo ? overlapFrom : new Date(targetListing.availableFrom);
  const initialTo = overlapFrom <= overlapTo ? overlapTo : new Date(targetListing.availableTo);

  const [dateFrom, setDateFrom] = useState(initialFrom.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(initialTo.toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [upgrade, setUpgrade] = useState<{ reason: string; upgradeTo: "plus" | "pro" } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUpgrade(null);
    start(async () => {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposerListingId: proposerListing.id,
          targetListingId: targetListing.id,
          dateFrom,
          dateTo,
          message: message || undefined,
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { id: string };
        router.push(`/swaps/${j.id}`);
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.status === 402 && (j.upgradeTo === "plus" || j.upgradeTo === "pro")) {
        setOpen(false);
        setUpgrade({ reason: String(j.error ?? "Plan limit reached"), upgradeTo: j.upgradeTo });
      } else {
        setError(String(j.error ?? "Could not send proposal."));
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="pill-primary w-full justify-center">
        <SwapArrows color="currentColor" size={16} />
        Propose swap
      </button>

      <UpgradeRequiredModal
        open={Boolean(upgrade)}
        onClose={() => setUpgrade(null)}
        reason={upgrade?.reason ?? ""}
        upgradeTo={upgrade?.upgradeTo ?? "plus"}
      />

      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(26,31,60,.5)" }}>
          <div className="surface-card max-w-lg w-full p-7 max-h-[90vh] overflow-y-auto">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-display text-2xl tracking-[-0.01em]">Propose a swap</h2>
              <button onClick={() => setOpen(false)} className="font-mono text-[11px]" aria-label="Close">×</button>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-6">
              <ThumbCard listing={proposerListing} label="Yours" />
              <div
                className="w-10 h-10 rounded-full grid place-items-center text-white"
                style={{ background: "var(--pink)" }}
              >
                <SwapArrows color="currentColor" size={20} />
              </div>
              <ThumbCard listing={targetListing} label="Theirs" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                    From
                  </span>
                  <input
                    type="date"
                    required
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                    To
                  </span>
                  <input
                    type="date"
                    required
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  Message (optional)
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Who's coming, why this place, anything they should know."
                  className="w-full px-3 py-2.5 rounded-lg border outline-none resize-none"
                  style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                />
              </label>

              {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="pill-ghost">
                  Cancel
                </button>
                <button type="submit" className="pill-primary" disabled={pending}>
                  {pending ? "Sending…" : "Send proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ThumbCard({ listing, label }: { listing: ListingDTO; label: string }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
    >
      <div className="aspect-[4/3]">
        <CityIllust city={listing.city} palette={listing.palette} />
      </div>
      <div className="p-2.5">
        <div className="font-mono text-[9px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {label}
        </div>
        <div className="font-display text-sm mt-0.5 truncate">
          {listing.neighbourhood} · {listing.city}
        </div>
      </div>
    </div>
  );
}
