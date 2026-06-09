"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

  // Lock body scroll while the modal is open so the page underneath doesn't
  // scroll behind the overlay.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

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
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftSource, setDraftSource] = useState<"ai" | "fallback" | null>(null);

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

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4"
          style={{ background: "rgba(245,238,224,.65)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onClick={(e) => {
            // Click outside the card → close. Stop the inner card from
            // bubbling.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="surface-card surface-card--static max-w-lg w-full p-7 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                    Message (optional)
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      setDraftBusy(true);
                      setDraftSource(null);
                      setError(null);
                      try {
                        const res = await fetch("/api/ai/proposal-message", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            proposerListingId: proposerListing.id,
                            targetListingId: targetListing.id,
                            dateFrom,
                            dateTo,
                            hostNotes: message || undefined,
                          }),
                        });
                        const j = await res.json();
                        if (!res.ok) throw new Error(j.error ?? "Couldn't draft");
                        setMessage(j.message);
                        setDraftSource(j.source);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Couldn't draft");
                      } finally {
                        setDraftBusy(false);
                      }
                    }}
                    disabled={draftBusy}
                    className="font-mono text-[10px] uppercase tracking-[.08em] underline"
                    style={{ color: "var(--pink)" }}
                  >
                    {draftBusy ? "Drafting…" : "✦ Draft with AI"}
                  </button>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Who's coming, why this place, anything they should know. Or tap 'Draft with AI' above to start."
                  className="w-full px-3 py-2.5 rounded-lg border outline-none resize-none"
                  style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                />
                {draftSource && (
                  <span
                    className="mt-1 inline-block font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                    style={{
                      background: draftSource === "ai" ? "var(--pink-light)" : "var(--cream-2)",
                      color: draftSource === "ai" ? "var(--pink)" : "var(--navy-3)",
                    }}
                  >
                    {draftSource === "ai" ? "AI draft — feel free to edit" : "Template draft — feel free to edit"}
                  </span>
                )}
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
        </div>,
        document.body
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
