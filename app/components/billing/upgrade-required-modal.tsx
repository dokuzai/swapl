"use client";

import Link from "next/link";

// Renders when an action is blocked by a plan limit. Caller passes the
// PlanLimitError payload returned by the 402 API response so we can show
// the *specific* reason and the recommended upgrade target.

export function UpgradeRequiredModal({
  open,
  onClose,
  reason,
  upgradeTo,
}: {
  open: boolean;
  onClose: () => void;
  reason: string;
  upgradeTo: "plus" | "pro";
}) {
  if (!open) return null;
  const target = upgradeTo === "plus" ? "swapl Plus" : "swapl Pro";
  const blurb =
    upgradeTo === "plus"
      ? "Plus unlocks unlimited proposals, up to 3 listings, advanced filters, calendar sync and saved-search alerts."
      : "Pro adds unlimited listings, listing analytics, the verified badge and multi-home / team accounts.";
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(245,238,224,.65)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
      <div className="surface-card surface-card--static max-w-md w-full p-7">
        <p className="kicker mb-2">Upgrade required</p>
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-3">{target}</h2>
        <p className="text-sm mb-2" style={{ color: "var(--navy-2)" }}>{reason}</p>
        <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>{blurb}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="pill-ghost">Not now</button>
          <Link href="/pricing" className="pill-primary">See plans</Link>
        </div>
      </div>
    </div>
  );
}
