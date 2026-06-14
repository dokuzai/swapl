"use client";

// Report-a-problem / dispute flow (DOK-153). One self-contained block that lives
// at the foot of the trip cockpit. It:
//   - loads any existing disputes for this agreement (GET .../dispute)
//   - if none, shows a single "Report a problem" button that opens a 2-3 tap
//     sheet: pick a category (icon grid), describe, optionally attach photos,
//     then POST .../dispute
//   - once a case exists, renders a status card with the back-and-forth timeline
//     (compose a reply + photos via POST /api/disputes/{id}/message) and a status
//     badge. Urgent cases (safety/access) foreground the 24/7 line.
//
// All gating is server-side; this component only renders what the API returns and
// re-fetches after every mutation so the status badge and timeline stay honest.

import { useCallback, useEffect, useState } from "react";
import { useT, useLocale } from "@/lib/i18n/client";
import { useSupportContacts } from "@/lib/support-contacts";

/**
 * Relative-date label ("2 hours ago", "just now") via Intl.RelativeTimeFormat,
 * so the cockpit reads at a glance on mobile without parsing absolute dates.
 * Intl handles the locale plurals for all 8 langs; "just now" comes from i18n.
 */
function useRelativeTime() {
  const locale = useLocale();
  const t = useT();
  return useCallback(
    (iso: string): string => {
      const then = new Date(iso).getTime();
      if (Number.isNaN(then)) return "";
      const diffSec = Math.round((then - Date.now()) / 1000);
      const abs = Math.abs(diffSec);
      if (abs < 45) return t("dispute.time.justNow");
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31536000],
        ["month", 2592000],
        ["week", 604800],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
      ];
      for (const [unit, secs] of units) {
        if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
      }
      return rtf.format(Math.round(diffSec / 60), "minute");
    },
    [locale, t],
  );
}

const CATEGORIES = ["access", "damage", "cleanliness", "safety", "no_show", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_ICON: Record<Category, string> = {
  access: "🔑",
  damage: "🔨",
  cleanliness: "🧽",
  safety: "🚨",
  no_show: "👻",
  other: "💬",
};

type DisputeStatus = "open" | "investigating" | "awaiting_response" | "resolved" | "closed";

type DisputeMessage = {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  photos: string[];
  createdAt: string;
};

type Dispute = {
  id: string;
  category: Category;
  urgent: boolean;
  status: DisputeStatus;
  description: string;
  photos: string[];
  resolution: string | null;
  openedBy: { id: string; name: string | null };
  createdAt: string;
  updatedAt: string;
  messages: DisputeMessage[];
};

const TERMINAL: ReadonlySet<DisputeStatus> = new Set(["resolved", "closed"]);

/**
 * A submit failure we can show the user. `rateLimited` (HTTP 429) is called out
 * specially so the UI can show the server's human message and invite a retry
 * rather than the generic "try again" copy. `message` is the server-supplied
 * human string when present (e.g. the 429 `message` field).
 */
type SubmitError = { rateLimited: boolean; message: string | null };

/**
 * Read a failed response into a SubmitError. The dispute routes return
 * `{ error, message }`; for 429 (`error: "RATE_LIMITED"`) we surface `message`
 * verbatim. Falls back to null so the caller can use its localized default.
 */
async function readSubmitError(res: Response): Promise<SubmitError> {
  let message: string | null = null;
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    if (typeof data.message === "string" && data.message.trim()) message = data.message;
  } catch {
    /* non-JSON body — fall back to localized copy */
  }
  return { rateLimited: res.status === 429, message };
}

/** Upload picked files through the existing listing-photo pipeline. */
async function uploadPhotos(files: FileList | null): Promise<string[]> {
  if (!files || files.length === 0) return [];
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
  return urls;
}

export function ReportProblem({ agreementId, myUserId }: { agreementId: string; myUserId: string }) {
  const t = useT();
  const support = useSupportContacts();
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agreements/${agreementId}/dispute`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { disputes: Dispute[] };
      setDisputes(data.disputes);
    } catch {
      setDisputes([]);
    }
  }, [agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {disputes?.map((d) => (
        <CaseCard key={d.id} dispute={d} myUserId={myUserId} onChanged={load} phone={support.phone} />
      ))}

      <div className="surface-card p-5">
        <div
          className="font-mono text-[11px] uppercase tracking-[.08em] mb-2"
          style={{ color: "var(--navy-3)" }}
        >
          {t("trip.report.title")}
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
          {t("trip.report.body", { phone: support.phone })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="pill-primary" onClick={() => setOpening(true)}>
            {t("dispute.report.cta")}
          </button>
          <a
            href={support.helpUrl}
            target="_blank"
            rel="noreferrer"
            className="pill-ghost inline-block"
          >
            {t("trip.report.helpCentre")} →
          </a>
        </div>
      </div>

      {opening && (
        <OpenCaseModal
          agreementId={agreementId}
          phone={support.phone}
          onClose={() => setOpening(false)}
          onOpened={() => {
            setOpening(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function OpenCaseModal({
  agreementId,
  phone,
  onClose,
  onOpened,
}: {
  agreementId: string;
  phone: string;
  onClose: () => void;
  onOpened: () => void;
}) {
  const t = useT();
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<SubmitError | null>(null);

  const urgent = category === "safety" || category === "access";
  const busy = state === "submitting" || state === "success";
  const canSubmit = !!category && description.trim().length > 0 && !uploading && !busy;

  async function addPhotos(files: FileList | null) {
    setUploading(true);
    try {
      const urls = await uploadPhotos(files);
      setPhotos((p) => [...p, ...urls].slice(0, 12));
    } finally {
      setUploading(false);
    }
  }

  const removePhoto = (src: string) => setPhotos((p) => p.filter((u) => u !== src));

  async function submit() {
    if (!category) return;
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description: description.trim(),
          photos: photos.length ? photos : undefined,
        }),
      });
      if (!res.ok) {
        // Keep the typed description + photos so a 429 (or any failure) costs a
        // single retry tap, not a re-type. The submit button stays enabled.
        setError(await readSubmitError(res));
        setState("error");
        return;
      }
      // Show a brief success state before the sheet closes, so the tap registers
      // as "done" rather than the sheet just vanishing.
      setState("success");
      setTimeout(onOpened, 900);
    } catch {
      setError({ rateLimited: false, message: null });
      setState("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "color-mix(in oklab, var(--navy) 45%, transparent)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && !uploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("dispute.open.title")}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ background: "var(--cream)", border: "1px solid var(--line)" }}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display text-2xl tracking-[-0.01em]">{t("dispute.open.title")}</h3>
          <button
            type="button"
            aria-label={t("ui.cancel")}
            onClick={onClose}
            style={{ color: "var(--navy-3)" }}
          >
            ×
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
          {t("dispute.open.lede")}
        </p>

        <label
          className="block font-mono text-[11px] uppercase tracking-[.08em] mb-2"
          style={{ color: "var(--navy-3)" }}
        >
          {t("dispute.open.categoryLabel")}
        </label>
        <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 mb-4">
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className="rounded-xl px-2 py-3 flex flex-col items-center gap-1.5 text-center transition-colors"
                style={{
                  border: active ? "1.5px solid var(--pink)" : "1px solid var(--line)",
                  background: active ? "var(--pink-light)" : "transparent",
                }}
              >
                <span aria-hidden className="text-xl leading-none">
                  {CATEGORY_ICON[c]}
                </span>
                <span
                  className="text-[11px] leading-tight"
                  style={{ color: active ? "var(--pink)" : "var(--navy-2)" }}
                >
                  {t(`dispute.category.${c}` as const)}
                </span>
              </button>
            );
          })}
        </div>

        {urgent && (
          <p
            className="text-sm rounded-lg px-3 py-2 mb-4"
            style={{ background: "var(--pink-light)", color: "var(--pink)" }}
          >
            {t("dispute.open.urgentNote", { phone })}
          </p>
        )}

        <label
          className="block font-mono text-[11px] uppercase tracking-[.08em] mb-1.5"
          style={{ color: "var(--navy-3)" }}
        >
          {t("dispute.open.descLabel")}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder={t("dispute.open.descPlaceholder")}
          maxLength={4000}
          className="w-full rounded-lg px-3 py-2 text-sm mb-1"
          style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
        />
        <CharCount value={description} max={4000} />

        <label
          className="block font-mono text-[11px] uppercase tracking-[.08em] mb-1.5"
          style={{ color: "var(--navy-3)" }}
        >
          {t("dispute.open.addPhotos")}
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void addPhotos(e.target.files)}
          className="block w-full text-sm mb-2"
        />
        <PhotoStrip photos={photos} onRemove={removePhoto} />
        {uploading && (
          <p className="text-xs mt-2 mb-3" style={{ color: "var(--navy-3)" }}>
            {t("dispute.open.uploading")}
          </p>
        )}
        {!uploading && photos.length > 0 && <div className="mb-3" />}

        {state === "error" && (
          <p className="text-sm mb-3" style={{ color: "var(--pink)" }} role="alert">
            {error?.rateLimited
              ? error.message ?? t("dispute.open.rateLimited")
              : t("dispute.open.error")}
          </p>
        )}

        {state === "success" ? (
          <p
            className="text-sm rounded-lg px-3 py-2.5 text-center font-medium"
            style={{ background: "var(--pink-light)", color: "var(--pink)" }}
            role="status"
          >
            ✓ {t("dispute.open.success")}
          </p>
        ) : (
          <button type="button" className="pill-primary w-full" disabled={!canSubmit} onClick={submit}>
            {uploading
              ? t("dispute.open.uploadingPhotos")
              : state === "submitting"
                ? t("dispute.open.submitting")
                : t("dispute.open.submit")}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DisputeStatus }) {
  const t = useT();
  const terminal = TERMINAL.has(status);
  const resolved = status === "resolved";
  // "Awaiting your reply" is the only status that asks the user to act, so it
  // gets a distinct amber treatment. Navy text on the warm amber fill clears
  // WCAG AA (≈13:1), well apart from the pink "active" and grey "terminal" looks.
  const awaiting = status === "awaiting_response";

  let background: string;
  let color: string;
  if (awaiting) {
    background = "#FBE6BF";
    color = "var(--navy)";
  } else if (resolved) {
    background = "color-mix(in oklab, var(--pink) 14%, transparent)";
    color = "var(--pink)";
  } else if (terminal) {
    background = "var(--line)";
    color = "var(--navy-3)";
  } else {
    background = "var(--pink-light)";
    color = "var(--pink)";
  }

  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-1 rounded-full whitespace-nowrap"
      style={
        awaiting
          ? { background, color, border: "1px solid #E0A23C" }
          : { background, color }
      }
    >
      {awaiting && <span aria-hidden>● </span>}
      {t(`dispute.status.${status}` as const)}
    </span>
  );
}

/**
 * Thumbnail strip. Read-only inside timeline bubbles; when `onRemove` is passed
 * (the composers) each thumb gets a tap-target × button so a mis-picked photo
 * costs one tap to drop rather than re-opening the whole sheet.
 */
function PhotoStrip({ photos, onRemove }: { photos: string[]; onRemove?: (src: string) => void }) {
  const t = useT();
  if (photos.length === 0) return null;
  return (
    <div className="flex gap-1.5 flex-wrap mt-2">
      {photos.map((src) => (
        <div key={src} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="h-16 w-16 rounded-lg object-cover"
            style={{ border: "1px solid var(--line)" }}
          />
          {onRemove && (
            <button
              type="button"
              aria-label={t("dispute.photo.remove")}
              onClick={() => onRemove(src)}
              // 44×44 tap target (a11y) anchored to the top-right corner; the
              // visible × badge sits centered in that corner via the inner span.
              className="absolute -top-3 -right-3 h-11 w-11 flex items-start justify-end"
            >
              <span
                aria-hidden
                className="h-5 w-5 rounded-full flex items-center justify-center text-xs leading-none"
                style={{ background: "var(--navy)", color: "var(--cream)", border: "1.5px solid var(--cream)" }}
              >
                ×
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Live character counter shown under a textarea. Turns pink as the user nears
 * the cap so the limit reads at a glance without blocking input.
 */
function CharCount({ value, max }: { value: string; max: number }) {
  const t = useT();
  const near = value.length >= max * 0.9;
  return (
    <p
      className="font-mono text-[10px] text-right mb-3"
      style={{ color: near ? "var(--pink)" : "var(--navy-3)" }}
      aria-live="polite"
    >
      {t("dispute.charCount", { n: value.length, max })}
    </p>
  );
}

function CaseCard({
  dispute,
  myUserId,
  onChanged,
  phone,
}: {
  dispute: Dispute;
  myUserId: string;
  onChanged: () => void;
  phone: string;
}) {
  const t = useT();
  const rel = useRelativeTime();
  const terminal = TERMINAL.has(dispute.status);
  const openedDate = rel(dispute.createdAt);

  return (
    <div
      className="surface-card p-5"
      style={dispute.urgent ? { border: "1.5px solid var(--pink)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="text-lg leading-none">
            {CATEGORY_ICON[dispute.category]}
          </span>
          <h3 className="font-display text-lg tracking-[-0.01em] truncate">
            {t(`dispute.category.${dispute.category}` as const)}
          </h3>
        </div>
        <StatusBadge status={dispute.status} />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
        {t("dispute.case.opened", { date: openedDate })}
      </p>

      {dispute.urgent && !terminal && (
        <p
          className="text-sm rounded-lg px-3 py-2 mb-3"
          style={{ background: "var(--pink-light)", color: "var(--pink)" }}
        >
          {t("dispute.case.urgentBanner", { phone })}
        </p>
      )}

      <Timeline dispute={dispute} myUserId={myUserId} />

      {dispute.resolution && (
        <div className="mt-3 rounded-lg p-3" style={{ background: "var(--cream-2, var(--line))" }}>
          <div
            className="font-mono text-[10px] uppercase tracking-[.08em] mb-1"
            style={{ color: "var(--navy-3)" }}
          >
            {t("dispute.case.resolution")}
          </div>
          <p className="text-sm whitespace-pre-line" style={{ color: "var(--navy)" }}>
            {dispute.resolution}
          </p>
        </div>
      )}

      {terminal ? (
        <p className="text-sm mt-3 flex items-center gap-1.5" style={{ color: "var(--navy-3)" }}>
          <span aria-hidden>✓</span>
          {t(dispute.status === "resolved" ? "dispute.case.resolvedNote" : "dispute.case.closedNote")}
        </p>
      ) : (
        <Composer disputeId={dispute.id} onSent={onChanged} />
      )}
    </div>
  );
}

function Timeline({ dispute, myUserId }: { dispute: Dispute; myUserId: string }) {
  const t = useT();

  // The opening description is the first bubble, authored by the opener.
  const openerMine = dispute.openedBy.id === myUserId;

  return (
    <ul className="space-y-3">
      <Bubble
        mine={openerMine}
        author={openerMine ? t("dispute.case.you") : dispute.openedBy.name ?? t("dispute.case.partner")}
        body={dispute.description}
        photos={dispute.photos}
        at={dispute.createdAt}
      />
      {dispute.messages.map((m) => {
        const mine = m.authorId === myUserId;
        return (
          <Bubble
            key={m.id}
            mine={mine}
            author={mine ? t("dispute.case.you") : m.authorName ?? t("dispute.case.support")}
            body={m.body}
            photos={m.photos}
            at={m.createdAt}
          />
        );
      })}
    </ul>
  );
}

function Bubble({
  mine,
  author,
  body,
  photos,
  at,
}: {
  mine: boolean;
  author: string;
  body: string;
  photos: string[];
  at: string;
}) {
  const rel = useRelativeTime();
  const time = rel(at);
  return (
    <li className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2.5"
        style={{
          background: mine ? "var(--pink-light)" : "var(--cream-2, var(--line))",
          borderBottomRightRadius: mine ? "0.35rem" : undefined,
          borderBottomLeftRadius: mine ? undefined : "0.35rem",
        }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-[.08em] mb-1"
          style={{ color: mine ? "var(--pink)" : "var(--navy-3)" }}
        >
          {author} · {time}
        </div>
        <p className="text-sm whitespace-pre-line" style={{ color: "var(--navy)" }}>
          {body}
        </p>
        <PhotoStrip photos={photos} />
      </div>
    </li>
  );
}

function Composer({ disputeId, onSent }: { disputeId: string; onSent: () => void }) {
  const t = useT();
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<SubmitError | null>(null);

  const canSend = body.trim().length > 0 && !uploading && state !== "sending";

  async function addPhotos(files: FileList | null) {
    setUploading(true);
    try {
      const urls = await uploadPhotos(files);
      setPhotos((p) => [...p, ...urls].slice(0, 12));
    } finally {
      setUploading(false);
    }
  }

  const removePhoto = (src: string) => setPhotos((p) => p.filter((u) => u !== src));

  async function send() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), photos: photos.length ? photos : undefined }),
      });
      if (!res.ok) {
        // Preserve the typed reply + photos so a 429 (or any failure) is one
        // retry tap away — never clear the composer on a failed send.
        setError(await readSubmitError(res));
        setState("error");
        return;
      }
      setBody("");
      setPhotos([]);
      // Flash a "sent" confirmation, then clear it once the refreshed timeline
      // (which now carries the new bubble) lands.
      setState("sent");
      setTimeout(() => setState("idle"), 2500);
      onSent();
    } catch {
      setError({ rateLimited: false, message: null });
      setState("error");
    }
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
      <label
        className="block font-mono text-[11px] uppercase tracking-[.08em] mb-1.5"
        style={{ color: "var(--navy-3)" }}
      >
        {t("dispute.case.replyLabel")}
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={t("dispute.case.replyPlaceholder")}
        maxLength={4000}
        className="w-full rounded-lg px-3 py-2 text-sm mb-1"
        style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
      />
      <CharCount value={body} max={4000} />
      <PhotoStrip photos={photos} onRemove={removePhoto} />
      <div className="flex items-center justify-between gap-2 mt-2">
        <label className="text-xs cursor-pointer" style={{ color: "var(--navy-3)" }}>
          📎{" "}
          {uploading
            ? t("dispute.open.uploading")
            : photos.length === 0
              ? t("dispute.case.addPhotos")
              : t("dispute.case.photoCount", { n: photos.length })}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => void addPhotos(e.target.files)}
            className="hidden"
          />
        </label>
        <button type="button" className="pill-primary" disabled={!canSend} onClick={send}>
          {state === "sending" ? t("dispute.case.sending") : t("dispute.case.send")}
        </button>
      </div>
      {state === "error" && (
        <p className="text-sm mt-2" style={{ color: "var(--pink)" }} role="alert">
          {error?.rateLimited
            ? error.message ?? t("dispute.case.rateLimited")
            : t("dispute.case.sendError")}
        </p>
      )}
      {state === "sent" && (
        <p className="text-sm mt-2" style={{ color: "var(--pink)" }} role="status">
          ✓ {t("dispute.case.sent")}
        </p>
      )}
    </div>
  );
}
