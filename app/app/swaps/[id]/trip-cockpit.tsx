"use client";

// Trip cockpit (DOK-152). Renders the post-agreement control centre for one
// party: a phase stepper + countdown, a "Before you go" checklist derived from
// the /trip payload, the key codes + insurance, and — only once the reveal gate
// has opened server-side — the host's exact address and home guide. Check-in /
// check-out actions carry a small baseline-photo uploader (reusing the existing
// listing-photo upload pipeline) and, after recording, surface the events.
//
// Reveal gating is enforced entirely by the server (/api/agreements/{id}/trip):
// before the gate opens the payload carries no address or guide content, only
// completeness percentages and an unlocksAt hint. This component never tries to
// reconstruct gated data — it just shows whatever the server chose to send.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { ProofOfCoverBadge } from "@/components/insurance/proof-of-cover-badge";
import { HomeGuideEditor } from "./home-guide-editor";
import { ReportProblem } from "./report-problem";
import { useSupportContacts } from "@/lib/support-contacts";

type TripPhase = "AGREED" | "PREPARING" | "READY" | "IN_PROGRESS" | "COMPLETED" | "INTERRUPTED";

const PHASE_ORDER: TripPhase[] = ["AGREED", "PREPARING", "READY", "IN_PROGRESS", "COMPLETED"];

type CheckEvent = {
  id: string;
  userId: string;
  type: string;
  note: string | null;
  photos: string[];
  createdAt: string;
  mine: boolean;
};

type GuideContent = Record<string, string | null>;

type TripPayload = {
  agreementId: string;
  phase: TripPhase;
  dates: { from: string; to: string };
  countdown: { days: number; hours: number };
  keyCodes: { mine: string | null };
  insurance: {
    policyNumber: string;
    coverageAmount: number;
    status: string;
    expiresAt: string;
    // DOK-156 — proof-of-cover DTO fields (null when anchoring is disabled).
    onChainStatus: string | null;
    onChainRef: string | null;
    explorerUrl: string | null;
  } | null;
  addressUnlocked: boolean;
  otherAddress: string | null;
  otherCity: string;
  otherGuide: GuideContent | { locked: true; unlocksAt: string } | null;
  myGuideCompleteness: number;
  otherGuideCompleteness: number;
  checklist: {
    guideFilled: boolean;
    detailsRead: boolean;
    checkedIn: boolean;
    checkedOut: boolean;
  };
  checkEvents: CheckEvent[];
};

const GUIDE_SECTION_FIELDS = [
  "accessInstructions",
  "keyPickup",
  "wifiName",
  "wifiPassword",
  "heatingCooling",
  "kitchen",
  "bins",
  "petsPlants",
  "houseRules",
  "neighbourhood",
  "emergencyContact",
] as const;

export function TripCockpit({
  agreementId,
  myListingId,
  myUserId,
  guestCode,
  myCode,
}: {
  agreementId: string;
  myListingId: string;
  myUserId: string;
  guestCode: string | null;
  myCode: string | null;
}) {
  const t = useT();
  const support = useSupportContacts();
  const [trip, setTrip] = useState<TripPayload | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agreements/${agreementId}/trip`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setTrip((await res.json()) as TripPayload);
      setError(false);
    } catch {
      setError(true);
    }
  }, [agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="surface-card p-5 text-sm" style={{ color: "var(--navy-2)" }}>
        {t("trip.error")}
      </div>
    );
  }
  if (!trip) {
    return <div className="surface-card p-5 text-sm" style={{ color: "var(--navy-3)" }}>…</div>;
  }

  const canCheckIn =
    (trip.phase === "READY" || trip.phase === "IN_PROGRESS") && !trip.checklist.checkedIn;
  const canCheckOut = trip.phase === "IN_PROGRESS" && trip.checklist.checkedIn && !trip.checklist.checkedOut;

  return (
    <div className="space-y-4">
      <PhaseStepper phase={trip.phase} countdown={trip.countdown} insured={!!trip.insurance} />

      <Checklist trip={trip} />

      {/* Key codes + insurance — unchanged content, now below the cockpit. */}
      <div className="surface-card p-5" style={{ background: "var(--navy)", color: "var(--cream)" }}>
        <h3 className="font-display text-lg mb-3" style={{ color: "var(--cream)" }}>
          {t("trip.keys.title")}
        </h3>
        <div className="space-y-4">
          <KeyRow label={t("trip.keys.guest")} code={guestCode} />
          <KeyRow label={t("trip.keys.yours")} code={myCode ?? trip.keyCodes.mine} />
        </div>
        {trip.insurance && (
          <p className="text-sm mt-4" style={{ color: "color-mix(in oklab, var(--cream) 75%, transparent)" }}>
            Policy <span className="font-mono">{trip.insurance.policyNumber}</span> · €
            {trip.insurance.coverageAmount.toLocaleString()} cover · 24/7 line:{" "}
            <span className="font-mono">{support.phone}</span>
          </p>
        )}
        {trip.insurance && (
          <ProofOfCoverBadge
            tone="dark"
            className="mt-4"
            onChainStatus={trip.insurance.onChainStatus}
            onChainRef={trip.insurance.onChainRef}
            explorerUrl={trip.insurance.explorerUrl}
            labels={{
              badge: t("cover.proof.badge"),
              blurb: t("cover.proof.blurb"),
              view: t("cover.proof.view"),
            }}
          />
        )}
      </div>

      <WhereYoureStaying trip={trip} />

      {(canCheckIn || canCheckOut || trip.checkEvents.length > 0) && (
        <CheckPanel
          agreementId={agreementId}
          canCheckIn={canCheckIn}
          canCheckOut={canCheckOut}
          events={trip.checkEvents}
          onDone={load}
        />
      )}

      <HomeGuideEditor listingId={myListingId} collapsible />

      <ReportProblem agreementId={agreementId} myUserId={myUserId} />
    </div>
  );
}

function PhaseStepper({
  phase,
  countdown,
  insured,
}: {
  phase: TripPhase;
  countdown: { days: number; hours: number };
  insured: boolean;
}) {
  const t = useT();
  const interrupted = phase === "INTERRUPTED";
  const currentIndex = interrupted ? -1 : PHASE_ORDER.indexOf(phase);

  let countdownLabel: string | null = null;
  if (!interrupted && phase !== "COMPLETED") {
    if (phase === "IN_PROGRESS") countdownLabel = t("trip.countdown.started");
    else if (countdown.days === 0) countdownLabel = t("trip.countdown.today");
    else if (countdown.days === 1) countdownLabel = t("trip.countdown.one");
    else countdownLabel = t("trip.countdown", { n: countdown.days });
  }

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-display text-lg tracking-[-0.01em]">{t("trip.title")}</h3>
        {insured && (
          <span
            className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-1 rounded-full whitespace-nowrap"
            style={{ background: "var(--pink-light)", color: "var(--pink)" }}
          >
            {t("trip.insured")}
          </span>
        )}
      </div>

      {interrupted ? (
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>
          {t("trip.phase.INTERRUPTED")}
        </p>
      ) : (
        <>
          <ol className="flex items-center gap-1" aria-label={t("trip.title")}>
            {PHASE_ORDER.map((p, i) => {
              const done = i < currentIndex;
              const active = i === currentIndex;
              return (
                <li key={p} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                  <div className="flex items-center w-full">
                    {i > 0 && (
                      <span
                        className="h-0.5 flex-1"
                        style={{ background: i <= currentIndex ? "var(--pink)" : "var(--line)" }}
                      />
                    )}
                    <span
                      aria-current={active ? "step" : undefined}
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{
                        background: done || active ? "var(--pink)" : "var(--line)",
                        boxShadow: active ? "0 0 0 3px var(--pink-light)" : undefined,
                      }}
                    />
                    {i < PHASE_ORDER.length - 1 && (
                      <span
                        className="h-0.5 flex-1"
                        style={{ background: i < currentIndex ? "var(--pink)" : "var(--line)" }}
                      />
                    )}
                  </div>
                  <span
                    className="font-mono text-[9px] uppercase tracking-[.06em] text-center leading-tight"
                    style={{ color: active ? "var(--pink)" : "var(--navy-3)" }}
                  >
                    {t(`trip.phase.${p}` as const)}
                  </span>
                </li>
              );
            })}
          </ol>
          {countdownLabel && (
            <p className="mt-4 font-display text-base tracking-[-0.01em] text-center">{countdownLabel}</p>
          )}
        </>
      )}
    </div>
  );
}

function Checklist({ trip }: { trip: TripPayload }) {
  const t = useT();
  const items = [
    { ok: trip.checklist.guideFilled, label: t("trip.checklist.guide") },
    { ok: trip.checklist.detailsRead, label: t("trip.checklist.details") },
    { ok: trip.checklist.checkedIn, label: t("trip.checklist.checkin") },
    { ok: trip.checklist.checkedOut, label: t("trip.checklist.checkout") },
  ];
  return (
    <div className="surface-card p-5">
      <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
        {t("trip.checklist.title")}
      </div>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="h-5 w-5 rounded-full shrink-0 grid place-items-center text-[11px]"
              style={{
                background: it.ok ? "var(--pink)" : "transparent",
                border: it.ok ? "none" : "1.5px solid var(--line)",
                color: "var(--cream)",
              }}
            >
              {it.ok ? "✓" : ""}
            </span>
            <span style={{ color: it.ok ? "var(--navy)" : "var(--navy-2)" }}>{it.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2">
        <Progress label={t("trip.checklist.yourGuide", { n: trip.myGuideCompleteness })} pct={trip.myGuideCompleteness} />
        <Progress label={t("trip.checklist.theirGuide", { n: trip.otherGuideCompleteness })} pct={trip.otherGuideCompleteness} />
      </div>
    </div>
  );
}

function Progress({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1" style={{ color: "var(--navy-3)" }}>
        <span>{label}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--pink)" }} />
      </div>
    </div>
  );
}

function KeyRow({ label, code }: { label: string; code: string | null }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "color-mix(in oklab, var(--cream) 60%, transparent)" }}>
        {label}
      </div>
      <div className="font-mono text-2xl tracking-widest">{code ?? "—"}</div>
    </div>
  );
}

function WhereYoureStaying({ trip }: { trip: TripPayload }) {
  const t = useT();
  const guide = trip.otherGuide;
  const locked = !trip.addressUnlocked || (guide != null && "locked" in guide);

  if (locked) {
    const unlocksAt =
      guide && "locked" in guide ? guide.unlocksAt : null;
    const dateLabel = unlocksAt
      ? new Date(unlocksAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "";
    return (
      <div className="surface-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden>🔒</span>
          <h3 className="font-display text-lg tracking-[-0.01em]">{t("trip.where.title")}</h3>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
          {t("trip.where.locked", { date: dateLabel })}
        </p>
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>
          {t("trip.where.lockedNote")}
        </p>
      </div>
    );
  }

  const guideContent = (guide && !("locked" in guide) ? guide : null) as GuideContent | null;
  const hasGuide = guideContent && GUIDE_SECTION_FIELDS.some((f) => guideContent[f]?.trim());

  return (
    <div className="surface-card p-5">
      <h3 className="font-display text-lg tracking-[-0.01em] mb-2">{t("trip.where.title")}</h3>
      <p className="text-sm mb-1" style={{ color: "var(--navy)" }}>
        {trip.otherAddress ?? trip.otherCity}
      </p>
      {trip.otherAddress && (
        <p className="text-xs mb-4" style={{ color: "var(--navy-3)" }}>
          {trip.otherCity}
        </p>
      )}

      <div className="font-mono text-[11px] uppercase tracking-[.08em] mt-4 mb-2" style={{ color: "var(--navy-3)" }}>
        {t("trip.guide.title")}
      </div>
      {hasGuide ? (
        <div className="space-y-1.5">
          {GUIDE_SECTION_FIELDS.filter((f) => guideContent![f]?.trim()).map((f) => (
            <details key={f} className="rounded-lg" style={{ border: "1px solid var(--line)" }}>
              <summary
                className="cursor-pointer list-none px-3 py-2 text-sm font-medium flex items-center justify-between"
              >
                {t(`guide.field.${f}` as const)}
                <span aria-hidden style={{ color: "var(--navy-3)" }}>+</span>
              </summary>
              <p className="px-3 pb-3 text-sm whitespace-pre-line" style={{ color: "var(--navy-2)" }}>
                {guideContent![f]}
              </p>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>
          {t("trip.guide.empty")}
        </p>
      )}
    </div>
  );
}

function CheckPanel({
  agreementId,
  canCheckIn,
  canCheckOut,
  events,
  onDone,
}: {
  agreementId: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  events: CheckEvent[];
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<"checkin" | "checkout" | null>(null);

  return (
    <div className="surface-card p-5">
      {events.length > 0 && (
        <ul className="space-y-2 mb-4">
          {events.map((e) => (
            <li key={e.id} className="text-sm flex items-start gap-2">
              <span aria-hidden style={{ color: "var(--pink)" }}>
                {e.type === "checkin" ? "→" : "←"}
              </span>
              <span style={{ color: "var(--navy-2)" }}>
                {e.mine
                  ? t(e.type === "checkin" ? "trip.event.checkin" : "trip.event.checkout")
                  : t(e.type === "checkin" ? "trip.event.checkinThem" : "trip.event.checkoutThem", { name: "Your partner" })}{" "}
                · {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                {e.photos.length > 0 && <> · {t("trip.event.photos", { n: e.photos.length })}</>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {canCheckIn && (
          <button type="button" className="pill-primary flex-1" onClick={() => setOpen("checkin")}>
            {t("trip.checkin.cta")}
          </button>
        )}
        {canCheckOut && (
          <button type="button" className="pill-ghost flex-1" onClick={() => setOpen("checkout")}>
            {t("trip.checkout.cta")}
          </button>
        )}
      </div>

      {open && (
        <CheckModal
          agreementId={agreementId}
          type={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            onDone();
          }}
        />
      )}
    </div>
  );
}

function CheckModal({
  agreementId,
  type,
  onClose,
  onDone,
}: {
  agreementId: string;
  type: "checkin" | "checkout";
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads/listing-photo", { method: "POST", body: form });
        if (res.ok) {
          const { url } = (await res.json()) as { url: string };
          urls.push(url);
        }
      }
      setPhotos((p) => [...p, ...urls].slice(0, 12));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setState("submitting");
    try {
      const res = await fetch(`/api/agreements/${agreementId}/${type === "checkin" ? "check-in" : "check-out"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined, photos: photos.length ? photos : undefined }),
      });
      if (!res.ok) throw new Error();
      onDone();
    } catch {
      setState("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklab, var(--navy) 45%, transparent)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && state !== "submitting") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(type === "checkin" ? "trip.checkin.title" : "trip.checkout.title")}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--cream)", border: "1px solid var(--line)" }}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-display text-2xl tracking-[-0.01em]">
            {t(type === "checkin" ? "trip.checkin.title" : "trip.checkout.title")}
          </h3>
          <button type="button" aria-label={t("ui.cancel")} onClick={onClose} style={{ color: "var(--navy-3)" }}>
            ×
          </button>
        </div>

        <label className="block font-mono text-[11px] uppercase tracking-[.08em] mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("trip.check.note")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={t("trip.check.notePlaceholder")}
          maxLength={2000}
          className="w-full rounded-lg px-3 py-2 text-sm mb-4"
          style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
        />

        <label className="block font-mono text-[11px] uppercase tracking-[.08em] mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("trip.check.addPhotos")}
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => uploadFiles(e.target.files)}
          className="block w-full text-sm mb-2"
        />
        {(uploading || photos.length > 0) && (
          <p className="text-xs mb-3" style={{ color: "var(--navy-3)" }}>
            {uploading ? t("trip.check.uploading") : t("trip.check.photoCount", { n: photos.length })}
          </p>
        )}

        {state === "error" && (
          <p className="text-sm mb-3" style={{ color: "var(--pink)" }}>
            {t("trip.check.error")}
          </p>
        )}

        <button
          type="button"
          className="pill-primary w-full"
          disabled={state === "submitting" || uploading}
          onClick={submit}
        >
          {state === "submitting" ? t("trip.check.submitting") : t("trip.check.submit")}
        </button>
      </div>
    </div>
  );
}

