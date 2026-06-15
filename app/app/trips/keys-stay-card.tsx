"use client";

// A single Keys stay in /trips (DOK-155). The host sees Confirm / Decline on a
// pending request; the guest sees Cancel. Confirming spends the held Keys,
// credits the host, and issues a cover policy — the card then shows the stay
// as Confirmed + Insured. Keys are travel points, so nothing here mentions
// money.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";

type Stay = {
  id: string;
  role: "guest" | "host";
  listing: { id: string; title: string; city: string };
  dateRange: string;
  nights: number;
  keysCost: number;
  status: string;
  insured: boolean;
};

const STATUS_KEY: Record<string, DictKey> = {
  pending: "trips.keys.status.pending",
  confirmed: "trips.keys.status.confirmed",
  declined: "trips.keys.status.declined",
  cancelled: "trips.keys.status.cancelled",
  completed: "trips.keys.status.completed",
};

function statusStyle(status: string): { bg: string; fg: string } {
  if (status === "confirmed" || status === "completed") return { bg: "var(--pink)", fg: "#fff" };
  if (status === "pending") return { bg: "var(--cream-2)", fg: "var(--navy-3)" };
  return { bg: "var(--cream-2)", fg: "var(--navy-3)" };
}

export function KeysStayCard({ stay }: { stay: Stay }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(path: string) {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/keys/stays/${stay.id}/${path}`, { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(t("trips.keys.actionError"));
    });
  }

  const sStyle = statusStyle(stay.status);
  const roleLabel = stay.role === "guest" ? t("trips.keys.asGuest") : t("trips.keys.asHost");

  return (
    <div className="surface-card surface-card--static p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
            {roleLabel}
          </div>
          <Link href={`/listings/${stay.listing.id}`} className="font-display text-xl tracking-[-0.01em] hover:underline">
            {stay.listing.title}
          </Link>
          <div className="text-sm mt-0.5" style={{ color: "var(--navy-2)" }}>
            {stay.listing.city} · {stay.dateRange}
          </div>
          <div className="font-mono text-[11px] mt-1" style={{ color: "var(--navy-3)" }}>
            {t("trips.keys.nights", { count: stay.nights, cost: stay.keysCost })}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
            style={{ background: sStyle.bg, color: sStyle.fg }}
          >
            {t(STATUS_KEY[stay.status] ?? "trips.keys.status.pending")}
          </span>
          {stay.insured && (
            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
              ◦ {t("trips.keys.insured")}
            </span>
          )}
        </div>
      </div>

      {/* Actions on a pending stay. */}
      {stay.status === "pending" && (
        <div className="mt-4 pt-4 divider-dashed flex flex-wrap items-center gap-2">
          {stay.role === "host" ? (
            <>
              <button className="pill-primary" disabled={pending} onClick={() => act("confirm")}>
                {pending ? t("trips.keys.working") : t("trips.keys.confirm")}
              </button>
              <button className="pill-ghost" disabled={pending} onClick={() => act("decline")}>
                {t("trips.keys.decline")}
              </button>
            </>
          ) : (
            <>
              <span className="text-sm" style={{ color: "var(--navy-2)" }}>{t("trips.keys.hostWillConfirm")}</span>
              <button className="pill-ghost ml-auto" disabled={pending} onClick={() => act("cancel")}>
                {pending ? t("trips.keys.working") : t("trips.keys.cancel")}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm mt-3" style={{ color: "#dc2626" }}>{error}</p>}
    </div>
  );
}
