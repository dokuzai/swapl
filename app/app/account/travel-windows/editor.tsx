"use client";

// Travel windows editor (DOK-161). Add/remove date windows with optional
// destinations + notes, a plan-tier counter ("2/3"), and an upsell when the
// POST returns 402. Each window expands into its AI proposals — real homes
// free for the exact dates (GET /api/travel-windows/{id}/proposals), each with
// a match badge and a link to a proposal / Stay-with-Keys booking.

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useT, useLocale } from "@/lib/i18n/client";
import { marketingUrl } from "@/lib/marketing/urls";

export type TravelWindowDTO = {
  id: string;
  dateFrom: string; // yyyy-MM-dd
  dateTo: string;
  flexible: boolean;
  destinations: string[];
  notes: string | null;
};

type WindowProposal = {
  listingId: string;
  title: string;
  city: string;
  country: string;
  photo: string | null;
  matchScore: number;
  modes: { directSwap: boolean; keysStay: boolean };
  nightlyKeys: number | null;
  why: string;
  matchesDestination: boolean;
};

export function TravelWindowsEditor({
  initialItems,
  maxWindows,
  hasActiveListing,
}: {
  initialItems: TravelWindowDTO[];
  maxWindows: number; // 0 = unlimited
  hasActiveListing: boolean;
}) {
  const t = useT();

  const [items, setItems] = useState<TravelWindowDTO[]>(initialItems);
  const [upsell, setUpsell] = useState<string | null>(null);

  const unlimited = maxWindows === 0;
  const atLimit = !unlimited && items.length >= maxWindows;

  const onAdded = useCallback((w: TravelWindowDTO) => {
    setItems((prev) => [...prev, w].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom)));
    setUpsell(null);
  }, []);

  const onRemoved = useCallback((id: string) => {
    setItems((prev) => prev.filter((w) => w.id !== id));
    setUpsell(null);
  }, []);

  return (
    <div className="space-y-8">
      {!hasActiveListing && <NoListingBanner />}

      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {unlimited
            ? t("tw.counterUnlimited", { count: items.length })
            : t("tw.counter", { count: items.length, max: maxWindows })}
        </p>
      </div>

      {atLimit ? (
        <UpsellCard reason={upsell ?? t("tw.limit.title")} />
      ) : (
        <AddWindowForm onAdded={onAdded} onUpsell={setUpsell} />
      )}

      {/* When over the limit we still show the upsell triggered by a 402 above
          the cap message, so the reason from the API is surfaced. */}
      {!atLimit && upsell && <UpsellCard reason={upsell} />}

      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>{t("tw.empty")}</p>
      ) : (
        <ul className="space-y-6">
          {items.map((w) => (
            <WindowCard key={w.id} window={w} onRemoved={onRemoved} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddWindowForm({
  onAdded,
  onUpsell,
}: {
  onAdded: (w: TravelWindowDTO) => void;
  onUpsell: (reason: string) => void;
}) {
  const t = useT();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [destinations, setDestinations] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dateFrom || !dateTo || dateTo <= dateFrom) {
      setError(t("tw.form.errorDates"));
      return;
    }
    const dests = destinations
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    start(async () => {
      const res = await fetch("/api/travel-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          flexible,
          destinations: dests.length ? dests : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 402) {
        onUpsell(j.error ?? t("tw.limit.title"));
        return;
      }
      if (res.ok && j.window) {
        onAdded(j.window as TravelWindowDTO);
        setDateFrom("");
        setDateTo("");
        setFlexible(false);
        setDestinations("");
        setNotes("");
      } else {
        setError(j.error ?? "Couldn't save");
      }
    });
  }

  return (
    <form onSubmit={submit} className="surface-card p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <FieldLabel>{t("tw.form.dateFrom")}</FieldLabel>
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
          <FieldLabel>{t("tw.form.dateTo")}</FieldLabel>
          <input
            type="date"
            required
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
      </div>

      <label className="flex items-center gap-2.5 text-sm cursor-pointer">
        <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} />
        <span>{t("tw.form.flexible")}</span>
      </label>

      <label className="block text-sm">
        <FieldLabel>{t("tw.form.destinations")}</FieldLabel>
        <input
          value={destinations}
          onChange={(e) => setDestinations(e.target.value)}
          placeholder="Lisbon, Portugal, Barcelona"
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
        <span className="block mt-1.5 text-[12px]" style={{ color: "var(--navy-3)" }}>
          {t("tw.form.destinationsHint")}
        </span>
      </label>

      <label className="block text-sm">
        <FieldLabel>{t("tw.form.notes")}</FieldLabel>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("tw.form.notesPlaceholder")}
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>

      {error && <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>}

      <button type="submit" disabled={pending} className="pill-primary">
        {pending ? t("tw.form.saving") : t("tw.form.add")}
      </button>
    </form>
  );
}

function NoListingBanner() {
  const t = useT();
  return (
    <div className="surface-card surface-card--static p-5" style={{ background: "var(--cream-2)" }}>
      <h3 className="font-display text-lg tracking-[-0.01em] mb-1.5">{t("tw.noListing.title")}</h3>
      <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>{t("tw.noListing.body")}</p>
      <Link href="/listings/new" className="pill-primary">{t("tw.noListing.cta")}</Link>
    </div>
  );
}

function UpsellCard({ reason }: { reason: string }) {
  const t = useT();
  return (
    <div className="surface-card surface-card--static p-6" style={{ background: "var(--pink-light)" }}>
      <h3 className="font-display text-xl tracking-[-0.01em] mb-2">{t("tw.limit.title")}</h3>
      <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>{reason}</p>
      <a href={marketingUrl("/pricing")} className="pill-primary">{t("tw.limit.cta")}</a>
    </div>
  );
}

function WindowCard({
  window: w,
  onRemoved,
}: {
  window: TravelWindowDTO;
  onRemoved: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [removing, startRemove] = useTransition();
  const [open, setOpen] = useState(false);

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  const monthLabel = new Date(`${w.dateFrom}T00:00:00`).toLocaleDateString(locale, { month: "long" });

  function remove() {
    startRemove(async () => {
      const res = await fetch(`/api/travel-windows/${w.id}`, { method: "DELETE" });
      if (res.ok) onRemoved(w.id);
    });
  }

  return (
    <li className="surface-card surface-card--static p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-lg tracking-[-0.01em]">
            {fmt(w.dateFrom)} – {fmt(w.dateTo)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {w.flexible && (
              <span
                className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                style={{ background: "var(--cream-2)", color: "var(--navy-3)" }}
              >
                {t("tw.flexibleBadge")}
              </span>
            )}
            <span className="text-sm" style={{ color: "var(--navy-2)" }}>
              {w.destinations.length ? w.destinations.join(" · ") : t("tw.anywhere")}
            </span>
          </div>
          {w.notes && <p className="mt-2 text-sm" style={{ color: "var(--navy-3)" }}>{w.notes}</p>}
        </div>
        <button
          onClick={remove}
          disabled={removing}
          className="font-mono text-[10px] uppercase tracking-[.08em] shrink-0"
          style={{ color: "var(--navy-3)" }}
        >
          {removing ? t("tw.removing") : t("tw.remove")}
        </button>
      </div>

      <div className="mt-4 pt-4 divider-dashed">
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[11px] uppercase tracking-[.08em]"
          style={{ color: "var(--pink)" }}
        >
          {open ? t("tw.proposals.hide") : t("tw.proposals.show")}
        </button>
        {open && <Proposals windowId={w.id} month={monthLabel} />}
      </div>
    </li>
  );
}

function Proposals({ windowId, month }: { windowId: string; month: string }) {
  const t = useT();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "noListing" }
    | { kind: "ready"; proposals: WindowProposal[] }
  >({ kind: "loading" });

  // Fetch once when this component mounts (i.e. the window is first expanded).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/travel-windows/${windowId}/proposals`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.status === 409 && j.code === "NO_ACTIVE_LISTING") {
          setState({ kind: "noListing" });
          return;
        }
        if (!r.ok) throw new Error(j.error ?? "error");
        setState({ kind: "ready", proposals: (j.proposals ?? []) as WindowProposal[] });
      })
      .catch(() => !cancelled && setState({ kind: "error", message: t("tw.proposals.error") }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId]);

  return (
    <div className="mt-4">
      <p className="kicker mb-3">{t("tw.proposals.heading", { month })}</p>

      {state.kind === "loading" && (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>{t("tw.proposals.loading")}</p>
      )}
      {state.kind === "error" && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>{state.message}</p>
      )}
      {state.kind === "noListing" && (
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("tw.proposals.noListing")}</p>
      )}
      {state.kind === "ready" && state.proposals.length === 0 && (
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("tw.proposals.empty")}</p>
      )}
      {state.kind === "ready" && state.proposals.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {state.proposals.map((p) => (
            <ProposalCard key={p.listingId} p={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalCard({ p }: { p: WindowProposal }) {
  const t = useT();
  return (
    <li className="surface-card overflow-hidden">
      <Link href={`/listings/${p.listingId}`} className="block">
        <div className="aspect-[16/10] relative" style={{ background: "var(--cream-2)" }}>
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.photo}
              alt={`${p.title} · ${p.city}`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : null}
          <span className="absolute top-3 left-3 match-badge">
            {t("tw.proposals.matchBadge", { score: p.matchScore })}
          </span>
        </div>
      </Link>
      <div className="p-4">
        <div className="font-display text-base tracking-[-0.01em]">
          {p.city}, {p.country}
        </div>
        {p.matchesDestination && (
          <span className="mt-1 inline-block font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
            ★ {t("tw.proposals.inWishlistDest")}
          </span>
        )}
        <p className="mt-2 text-sm leading-snug" style={{ color: "var(--navy-2)" }}>{p.why}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/listings/${p.listingId}`} className="pill-primary text-[13px] px-3.5 py-1.5">
            {t("tw.proposals.directSwap")}
          </Link>
          {p.modes.keysStay && (
            <Link href={`/listings/${p.listingId}#stay-with-keys`} className="pill-ghost text-[13px] px-3.5 py-1.5">
              {t("tw.proposals.keysStay")}
              {typeof p.nightlyKeys === "number" && p.nightlyKeys > 0
                ? ` · ${t("tw.proposals.nightlyKeys", { keys: p.nightlyKeys })}`
                : ""}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
      {children}
    </span>
  );
}
