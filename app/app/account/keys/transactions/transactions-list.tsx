"use client";

// Dedicated, filterable Keys ledger (DOK-157). Reads the append-only ledger via
// GET /api/keys/transactions: chip filters per kind, the running balanceAfter
// the ledger already stamps on every row, and cursor pagination ("Load more").
// Keys are travel points — there's no price, no cash anywhere here.

import { useCallback, useEffect, useState } from "react";
import { useT, useLocale } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";

type Tx = {
  id: string;
  delta: number;
  kind: string;
  balanceAfter: number;
  stayId: string | null;
  note: string | null;
  createdAt: string;
};

// Ledger kinds → i18n label key. Mirrors KeysKind in lib/keys/ledger.
const KIND_KEY: Record<string, DictKey> = {
  earn_host: "keys.kind.earn_host",
  spend_stay: "keys.kind.spend_stay",
  welcome_bonus: "keys.kind.welcome_bonus",
  gift_sent: "keys.kind.gift_sent",
  gift_received: "keys.kind.gift_received",
  refund: "keys.kind.refund",
  hold: "keys.kind.hold",
  release: "keys.kind.release",
  referral_bonus: "keys.kind.referral_bonus",
  invite_bonus: "keys.kind.invite_bonus",
  earn_property_verified: "keys.kind.earn_property_verified",
  earn_review: "keys.kind.earn_review",
  earn_share_converted: "keys.kind.earn_share_converted",
  earn_listing_complete: "keys.kind.earn_listing_complete",
};

// Chip order — "all" first, then the kinds that matter most to a member.
const KIND_CHIPS: string[] = [
  "earn_host",
  "spend_stay",
  "welcome_bonus",
  "earn_property_verified",
  "earn_listing_complete",
  "earn_review",
  "earn_share_converted",
  "referral_bonus",
  "invite_bonus",
  "gift_received",
  "gift_sent",
  "refund",
  "hold",
  "release",
];

export function KeysTransactionsList() {
  const t = useT();
  const locale = useLocale();
  const [kind, setKind] = useState<string | null>(null);
  const [rows, setRows] = useState<Tx[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (activeKind: string | null, activeCursor: string | null, append: boolean) => {
      setLoading(true);
      setError(false);
      const params = new URLSearchParams();
      if (activeKind) params.set("kind", activeKind);
      if (activeCursor) params.set("cursor", activeCursor);
      try {
        const res = await fetch(`/api/keys/transactions?${params.toString()}`);
        if (!res.ok) throw new Error("bad status");
        const j = (await res.json()) as { transactions: Tx[]; nextCursor: string | null; hasMore: boolean };
        setRows((prev) => (append ? [...prev, ...j.transactions] : j.transactions));
        setCursor(j.nextCursor);
        setHasMore(j.hasMore);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Reload from scratch whenever the active filter changes.
  useEffect(() => {
    void load(kind, null, false);
  }, [kind, load]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });

  const chipBase =
    "shrink-0 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-[.06em] border cursor-pointer transition-colors";
  const chip = (active: boolean) =>
    active
      ? { background: "var(--pink)", color: "#fff", borderColor: "var(--pink)" }
      : { background: "var(--card-bg)", color: "var(--navy-2)", borderColor: "var(--line)" };

  return (
    <div>
      {/* ---- Filter chips ---- */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1" role="tablist" aria-label="Filter by kind">
        <button
          type="button"
          role="tab"
          aria-selected={kind === null}
          className={chipBase}
          style={chip(kind === null)}
          onClick={() => setKind(null)}
        >
          {t("keys.tx.filter.all")}
        </button>
        {KIND_CHIPS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={chipBase}
            style={chip(kind === k)}
            onClick={() => setKind(k)}
          >
            {KIND_KEY[k] ? t(KIND_KEY[k]) : k}
          </button>
        ))}
      </div>

      {/* ---- List ---- */}
      <div className="surface-card surface-card--static p-6 mt-2">
        {error ? (
          <div className="text-sm" style={{ color: "#dc2626" }}>
            {t("keys.tx.error")}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void load(kind, null, false)}
            >
              {t("keys.tx.loadMore")}
            </button>
          </div>
        ) : rows.length === 0 && !loading ? (
          <p className="text-sm" style={{ color: "var(--navy-2)" }}>
            {kind ? t("keys.tx.emptyKind") : t("keys.tx.empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((tx) => {
              const positive = tx.delta > 0;
              const label = KIND_KEY[tx.kind] ? t(KIND_KEY[tx.kind]) : tx.kind;
              return (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                  style={{ borderColor: "var(--cream-2)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{label}</div>
                    <div
                      className="font-mono text-[10px] uppercase tracking-[.08em]"
                      style={{ color: "var(--navy-3)" }}
                    >
                      {fmtDate(tx.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className="font-display text-lg leading-none"
                      style={{ color: positive ? "var(--pink)" : "var(--navy-2)" }}
                    >
                      {positive ? "+" : ""}
                      {tx.delta}
                    </div>
                    <div
                      className="font-mono text-[10px] uppercase tracking-[.08em]"
                      style={{ color: "var(--navy-3)" }}
                    >
                      {t("keys.tx.balanceAfter", { balance: tx.balanceAfter })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* ---- Pagination ---- */}
        {(hasMore || loading) && (
          <div className="mt-5 text-center">
            <button
              type="button"
              className="pill-ghost"
              disabled={loading}
              onClick={() => hasMore && void load(kind, cursor, true)}
            >
              {loading ? t("keys.tx.loading") : t("keys.tx.loadMore")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
