"use client";

// "Get Inspired" client flow (DOK-146, extended by DOK-148).
//
// Step 1 — free-text wish (typed OR dictated via the Web Speech API — the
//          transcription runs on-device in the browser, no audio ever reaches
//          our servers) + optional date range → POST /api/assistant/inspire.
// Step 2 — ready-to-confirm package: destination hero, "Understood: …" box
//          from the interpreted spoken filters, inline-editable dates,
//          prefilled proposal message, clickable alternatives, and per-item
//          toggles on experiences / services / concierge add-ons
//          (PATCH …/items, optimistic). Only selected concierge add-ons are
//          payable — affiliate items stay external links.
// Confirm — POST …/checkout first: if it answers paymentRequired we show the
//          "Payment & reservation" step (Stripe SetupIntent — card saved,
//          charged ONLY if the host accepts). Then POST …/confirm creates a
//          REAL proposal through the same code path as POST /api/proposals
//          and we redirect to the swap thread. Without Stripe or with zero
//          payable items the confirm is direct, as before.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n/client";
import { CityIllust } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import type { InspirePackage, InspireCandidate, TripConstraint } from "@/lib/ai/inspire";
import type { CheckoutSummary } from "./payment-step";

// Loaded only when the payment step is actually shown, so @stripe/stripe-js
// stays out of the page bundle entirely.
const PaymentStep = dynamic(() => import("./payment-step"), { ssr: false });

function Sparkles({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
    </svg>
  );
}

function Mic({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

async function readError(res: Response, fallback: string): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return j.message ?? j.error ?? fallback;
}

// ---- Web Speech API (minimal structural types — lib.dom has no global) ----

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SPEECH_LANG: Record<string, string> = {
  en: "en-US",
  it: "it-IT",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  pt: "pt-PT",
  nl: "nl-NL",
  tr: "tr-TR",
};

const CONSTRAINT_KEY = {
  "pet-friendly": "inspire.constraint.petFriendly",
  wfh: "inspire.constraint.wfh",
  "step-free": "inspire.constraint.stepFree",
} as const satisfies Record<TripConstraint, string>;

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function InspireClient() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  // Step 1 state
  const [prompt, setPrompt] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice input (hidden entirely when the browser has no Web Speech API)
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const promptBaseRef = useRef("");
  useEffect(() => {
    setSpeechAvailable(speechRecognitionCtor() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  // Step 2 state
  const [pkg, setPkg] = useState<InspirePackage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Payment step ({ paymentRequired: true } from POST …/checkout)
  const [payment, setPayment] = useState<{ clientSecret: string; summary: CheckoutSummary } | null>(null);

  // Recompose client-side: the hero shows whichever of the package's real
  // listings is selected; "why" only ever describes the assistant's pick.
  const all: InspireCandidate[] = useMemo(
    () => (pkg ? [pkg.destination, ...pkg.alternatives] : []),
    [pkg]
  );
  const hero = all.find((c) => c.listingId === selectedId) ?? pkg?.destination ?? null;
  const alternatives = all.filter((c) => c.listingId !== hero?.listingId);
  const isOriginalPick = hero?.listingId === pkg?.destination.listingId;

  // Payable = selected concierge add-ons only (affiliate items are links,
  // never charged by us). Recomputed locally on every optimistic toggle.
  const payable = useMemo(() => {
    const items = (pkg?.addOns ?? []).filter((a) => a.selected && a.priceCents > 0);
    return {
      items,
      totalCents: items.reduce((sum, a) => sum + a.priceCents, 0),
      currency: items[0]?.currency ?? "EUR",
    };
  }, [pkg]);

  // What the assistant understood from the (possibly spoken) prompt.
  const understood = useMemo(() => {
    const f = pkg?.interpreted;
    if (!f) return null;
    const parts: string[] = [];
    if (f.city) parts.push(f.city);
    if (f.dateFrom && f.dateTo) parts.push(`${f.dateFrom} → ${f.dateTo}`);
    else if (f.dateFrom) parts.push(`${t("inspire.dateFrom")} ${f.dateFrom}`);
    for (const c of f.constraints ?? []) parts.push(t(CONSTRAINT_KEY[c]));
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [pkg, t]);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[locale] ?? "en-US";
    rec.interimResults = true; // live transcript straight into the field
    rec.continuous = true;
    promptBaseRef.current = prompt.trim();
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      const base = promptBaseRef.current;
      setPrompt(base ? `${base} ${transcript.trimStart()}` : transcript.trimStart());
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function compose(e: React.FormEvent) {
    e.preventDefault();
    stopListening();
    setComposing(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (prompt.trim()) body.prompt = prompt.trim();
      if (dateFrom && dateTo) {
        body.dateFrom = dateFrom;
        body.dateTo = dateTo;
      }
      const res = await fetch("/api/assistant/inspire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, t("inspire.error.generic")));
      const p = (await res.json()) as InspirePackage;
      setPkg(p);
      setSelectedId(p.destination.listingId);
      setEditFrom(p.dates.from);
      setEditTo(p.dates.to);
      setMessage(p.proposalMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inspire.error.generic"));
    } finally {
      setComposing(false);
    }
  }

  // Optimistic per-item toggle → PATCH …/items; reverted on failure.
  async function toggleItem(list: "experiences" | "services" | "addOns", itemId: string, selected: boolean) {
    if (!pkg) return;
    const prev = pkg;
    setPkg({
      ...pkg,
      [list]: pkg[list].map((item) => (item.id === itemId ? { ...item, selected } : item)),
    } as InspirePackage);
    try {
      const res = await fetch(`/api/assistant/inspire/${pkg.packageId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, selected }),
      });
      if (!res.ok) throw new Error(await readError(res, t("inspire.error.generic")));
    } catch (err) {
      setPkg(prev);
      setError(err instanceof Error ? err.message : t("inspire.error.generic"));
    }
  }

  // Confirm, phase 1 — ask the checkout route whether a payment step is
  // needed. Env-gated degrade: no Stripe server-side, no publishable key
  // client-side, or zero payable items → straight to the proposal.
  async function confirm() {
    if (!pkg || !hero) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/assistant/inspire/${pkg.packageId}/checkout`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as {
          paymentRequired: boolean;
          clientSecret?: string;
          summary: CheckoutSummary;
        };
        if (data.paymentRequired && data.clientSecret && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
          setPayment({ clientSecret: data.clientSecret, summary: data.summary });
          setConfirming(false);
          return;
        }
      }
      // Checkout said "no payment step" (or degraded) — confirm never blocks
      // on payment, so go ahead and send the proposal.
      await sendProposal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inspire.error.generic"));
      setConfirming(false);
    }
  }

  // Confirm, phase 2 — create the REAL proposal and open the swap thread.
  async function sendProposal() {
    if (!pkg || !hero) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/assistant/inspire/${pkg.packageId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: hero.listingId,
          dateFrom: editFrom,
          dateTo: editTo,
          message,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, t("inspire.error.generic")));
      const { proposalId } = (await res.json()) as { proposalId: string };
      setToast(t("inspire.toastSent"));
      setTimeout(() => router.push(`/swaps/${proposalId}`), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inspire.error.generic"));
      setConfirming(false);
    }
  }

  async function dismiss() {
    if (!pkg) return;
    // Best effort — the row just flips to "dismissed" for future learning.
    fetch(`/api/assistant/inspire/${pkg.packageId}/dismiss`, { method: "POST" }).catch(() => {});
    setPkg(null);
    setSelectedId(null);
    setPayment(null);
    setError(null);
  }

  const labelStyle: React.CSSProperties = { color: "var(--navy-3)" };
  const mutedStyle: React.CSSProperties = { color: "var(--navy-2)" };

  const itemCheckbox = (
    list: "experiences" | "services" | "addOns",
    item: { id: string; selected: boolean },
    name: string
  ) => (
    <input
      type="checkbox"
      checked={item.selected}
      onChange={(e) => toggleItem(list, item.id, e.target.checked)}
      aria-label={t("inspire.items.toggle", { name })}
      className="size-4 shrink-0 accent-[var(--pink)]"
      style={{ accentColor: "var(--pink)" }}
    />
  );

  return (
    <div className="wrap py-10 lg:py-14 max-w-4xl">
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-sm shadow-lg"
          style={{ background: "var(--navy)", color: "var(--cream)" }}
        >
          {toast}
        </div>
      )}

      <header className="mb-10">
        <p className="kicker mb-3">{t("inspire.kicker")}</p>
        <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
          {t("inspire.title")}
        </h1>
        <p className="mt-3 max-w-2xl text-[16px]" style={mutedStyle}>
          {t("inspire.lede")}
        </p>
      </header>

      {payment && pkg ? (
        <div className="space-y-4">
          <PaymentStep
            clientSecret={payment.clientSecret}
            summary={payment.summary}
            onConfirmed={sendProposal}
            onBack={() => setPayment(null)}
          />
          {error && (
            <p className="text-sm" role="alert" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}
        </div>
      ) : !pkg ? (
        <form onSubmit={compose} className="surface-card p-6 lg:p-8 space-y-5">
          <div>
            <label
              htmlFor="inspire-prompt"
              className="font-mono text-[10px] uppercase tracking-[.1em] block mb-2"
              style={labelStyle}
            >
              {t("inspire.promptLabel")}
            </label>
            <div className="relative">
              <textarea
                id="inspire-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t("inspire.promptPlaceholder")}
                className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none focus:ring-2"
                style={{
                  borderColor: listening ? "var(--pink)" : "var(--line)",
                  background: "var(--cream)",
                  paddingRight: speechAvailable ? "3.25rem" : undefined,
                }}
              />
              {speechAvailable && (
                <button
                  type="button"
                  onClick={toggleListening}
                  aria-pressed={listening}
                  aria-label={listening ? t("inspire.mic.stop") : t("inspire.mic.start")}
                  title={listening ? t("inspire.mic.stop") : t("inspire.mic.start")}
                  className={`absolute right-2.5 bottom-3 size-9 rounded-full inline-flex items-center justify-center transition-colors ${listening ? "animate-pulse" : ""}`}
                  style={
                    listening
                      ? { background: "var(--pink)", color: "#fff" }
                      : { background: "var(--cream-2)", color: "var(--navy-2)" }
                  }
                >
                  <Mic />
                </button>
              )}
            </div>
            {listening && (
              <p className="mt-1.5 text-xs" role="status" style={{ color: "var(--pink)" }}>
                {t("inspire.mic.listening")}
              </p>
            )}
          </div>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-2" style={labelStyle}>
              {t("inspire.datesLabel")}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm" style={mutedStyle}>
                {t("inspire.dateFrom")}
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-lg border px-2.5 py-1.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--cream)" }}
                />
              </label>
              <label className="flex items-center gap-2 text-sm" style={mutedStyle}>
                {t("inspire.dateTo")}
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-lg border px-2.5 py-1.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--cream)" }}
                />
              </label>
            </div>
          </div>
          {error && (
            <p className="text-sm" role="alert" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={composing} className="pill-primary inline-flex items-center gap-2">
            <Sparkles />
            {composing ? t("inspire.composing") : t("inspire.submit")}
          </button>
        </form>
      ) : (
        hero && (
          <div className="space-y-6">
            {/* ---- "Understood: …" — the interpreted spoken filters ---- */}
            {understood && (
              <div
                className="rounded-xl px-4 py-3 text-sm flex items-baseline gap-2 flex-wrap"
                style={{ background: "var(--cream-2)", color: "var(--navy)" }}
                role="note"
              >
                <span className="font-medium">{t("inspire.understood")}</span>
                <span>{understood}</span>
              </div>
            )}

            {/* ---- Destination hero ---- */}
            <section className="surface-card overflow-hidden">
              <div className="aspect-[16/7] relative" style={{ background: "var(--cream-2)" }}>
                {hero.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hero.photo}
                    alt={`${hero.title} in ${hero.city}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <CityIllust city={hero.city} palette={paletteForCity(hero.city)} className="absolute inset-0 w-full h-full" />
                )}
                <span
                  className="absolute top-4 right-4 font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
                  style={{ background: "var(--pink)", color: "#fff" }}
                >
                  {t("inspire.matchBadge", { score: hero.matchScore })}
                </span>
              </div>
              <div className="p-6 lg:p-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="kicker mb-1">{t("inspire.packageKicker")}</p>
                    <h2 className="font-display text-3xl tracking-[-0.01em] font-medium">
                      {hero.title}
                    </h2>
                    <p className="mt-1 text-[15px]" style={mutedStyle}>
                      {hero.city}, {hero.country}
                    </p>
                  </div>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
                    style={{
                      background: pkg.source === "ai" ? "var(--pink-light)" : "var(--cream-2)",
                      color: pkg.source === "ai" ? "var(--pink)" : "var(--navy-3)",
                    }}
                  >
                    {pkg.source === "ai" ? t("inspire.sourceAI") : t("inspire.sourceFallback")}
                  </span>
                </div>
                <div className="mt-5">
                  <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-1.5" style={labelStyle}>
                    {t("inspire.whyTitle")}
                  </h3>
                  <p className="text-[15px] leading-relaxed">
                    {isOriginalPick ? pkg.destination.why : t("inspire.altWhy", { score: hero.matchScore })}
                  </p>
                </div>
                <Link
                  href={`/listings/${hero.listingId}`}
                  className="inline-block mt-4 text-sm font-medium"
                  style={{ color: "var(--pink)" }}
                >
                  {t("inspire.viewListing")} →
                </Link>
              </div>
            </section>

            {/* ---- Dates (inline editable) ---- */}
            <section className="surface-card p-6">
              <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-3" style={labelStyle}>
                {t("inspire.datesTitle")}
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  aria-label={t("inspire.dateFrom")}
                  value={editFrom}
                  onChange={(e) => setEditFrom(e.target.value)}
                  className="rounded-lg border px-2.5 py-1.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--cream)" }}
                />
                <span style={mutedStyle}>→</span>
                <input
                  type="date"
                  aria-label={t("inspire.dateTo")}
                  value={editTo}
                  min={editFrom || undefined}
                  onChange={(e) => setEditTo(e.target.value)}
                  className="rounded-lg border px-2.5 py-1.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--cream)" }}
                />
              </div>
              {pkg.dates.source === "availability" && (
                <p className="mt-2 text-xs" style={mutedStyle}>
                  {t("inspire.datesFromAvailability")}
                </p>
              )}
            </section>

            {/* ---- Proposal message ---- */}
            <section className="surface-card p-6">
              <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-3" style={labelStyle}>
                {t("inspire.messageTitle")}
              </h3>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={6}
                className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)", background: "var(--cream)" }}
              />
            </section>

            {/* ---- Alternatives ---- */}
            {alternatives.length > 0 && (
              <section>
                <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-3" style={labelStyle}>
                  {t("inspire.alternativesTitle")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {alternatives.map((alt) => (
                    <button
                      key={alt.listingId}
                      type="button"
                      onClick={() => setSelectedId(alt.listingId)}
                      className="surface-card overflow-hidden text-left flex items-stretch gap-0 transition-transform hover:-translate-y-0.5"
                    >
                      <div className="w-28 shrink-0 relative" style={{ background: "var(--cream-2)" }}>
                        {alt.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={alt.photo}
                            alt={`${alt.title} in ${alt.city}`}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <CityIllust city={alt.city} palette={paletteForCity(alt.city)} className="absolute inset-0 w-full h-full" />
                        )}
                      </div>
                      <div className="p-4 min-w-0">
                        <p className="font-medium text-sm truncate">{alt.title}</p>
                        <p className="text-sm truncate" style={mutedStyle}>
                          {alt.city}, {alt.country}
                        </p>
                        <span
                          className="inline-block mt-2 font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                          style={{ background: "var(--cream-2)", color: "var(--navy-3)" }}
                        >
                          {t("inspire.matchBadge", { score: alt.matchScore })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ---- swapl concierge add-ons (the ONLY payable items) ---- */}
            {pkg.addOns.length > 0 && (
              <section className="surface-card p-6">
                <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={labelStyle}>
                  {t("inspire.addOnsHeading")}
                </h3>
                <p className="text-xs mb-4" style={mutedStyle}>
                  {t("inspire.addOnsNote")}
                </p>
                <ul className="space-y-3">
                  {pkg.addOns.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 rounded-xl border px-4 py-3 transition-opacity"
                      style={{ borderColor: "var(--line)", opacity: a.selected ? 1 : 0.55 }}
                    >
                      <span className="mt-0.5">{itemCheckbox("addOns", a, a.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{a.name}</span>
                        <span className="block text-xs mt-0.5" style={mutedStyle}>
                          {a.description}
                        </span>
                      </span>
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {formatMoney(a.priceCents, a.currency, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ---- Round out the trip (affiliate links, env-gated) ---- */}
            {(pkg.experiences.length > 0 || pkg.services.length > 0) && (
              <section className="surface-card p-6">
                <h3 className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={labelStyle}>
                  {t("inspire.roundOutTitle")}
                </h3>
                <p className="text-xs mb-4" style={mutedStyle}>
                  {t("inspire.roundOutNote")}
                </p>
                {pkg.experiences.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium mb-2">{t("inspire.experiencesHeading")}</p>
                    <ul className="space-y-2">
                      {pkg.experiences.map((ex) => (
                        <li
                          key={ex.id}
                          className="flex items-center gap-2.5 transition-opacity"
                          style={{ opacity: ex.selected ? 1 : 0.55 }}
                        >
                          {itemCheckbox("experiences", ex, ex.title)}
                          <a
                            href={ex.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium"
                            style={{ color: "var(--pink)" }}
                          >
                            {ex.title} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pkg.services.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{t("inspire.servicesHeading")}</p>
                    <ul className="flex flex-wrap gap-2.5">
                      {pkg.services.map((s) => (
                        <li
                          key={s.id}
                          className="inline-flex items-center gap-2 rounded-full border pl-3 pr-1 py-0.5 transition-opacity"
                          style={{ borderColor: "var(--line)", opacity: s.selected ? 1 : 0.55 }}
                        >
                          {itemCheckbox("services", s, s.name)}
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pill-ghost text-sm"
                          >
                            {s.name} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* ---- Payable summary ---- */}
            <div
              className="rounded-xl px-5 py-3.5 flex items-baseline justify-between gap-3 text-sm"
              style={{ background: "var(--cream-2)" }}
            >
              {payable.totalCents > 0 ? (
                <>
                  <span className="font-medium">{t("inspire.payable.total")}</span>
                  <span className="font-semibold">
                    {formatMoney(payable.totalCents, payable.currency, locale)}
                  </span>
                </>
              ) : (
                <span style={mutedStyle}>{t("inspire.payable.none")}</span>
              )}
            </div>
            {payable.totalCents > 0 && (
              <p className="text-xs -mt-3" style={mutedStyle}>
                {t("inspire.checkout.note")}
              </p>
            )}

            {error && (
              <p className="text-sm" role="alert" style={{ color: "#dc2626" }}>
                {error}
              </p>
            )}

            {/* ---- Actions ---- */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={confirm}
                disabled={confirming || !!toast}
                className="pill-primary inline-flex items-center gap-2"
              >
                <Sparkles />
                {confirming ? t("inspire.confirming") : t("inspire.confirm")}
              </button>
              <button type="button" onClick={dismiss} disabled={confirming} className="pill-ghost">
                {t("inspire.dismiss")}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
