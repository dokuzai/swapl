"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { OwnerVerifiedBadge } from "@/components/listing/badges";

type Doc = { url: string; label: string };
type DocType = "deed" | "lease" | "other";

export type VerificationInitial = {
  status: "none" | "pending" | "approved" | "rejected";
  documents: Doc[];
  note: string | null;
  // AI verification context (DOK-186) — read-only DTO fields; advisory only.
  aiClassification: string | null;
  documentType: DocType | null;
  ineligibleReason: string | null;
};

const BUSINESS_INELIGIBLE_REASON = "business_property";

// Optional owner-proof verification (DOK-162). Never a gate to publishing — this
// page exists purely so a host can earn the discreet "Verified owner" badge.
export default function PropertyVerificationForm({
  listingId,
  ownerVerified,
  initial,
}: {
  listingId: string;
  ownerVerified: boolean;
  initial: VerificationInitial;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>(
    initial.documents.length > 0 ? initial.documents : [{ url: "", label: "" }]
  );
  const [docType, setDocType] = useState<DocType>(initial.documentType ?? "deed");

  const status = initial.status;
  const showForm = status === "none" || status === "rejected";

  // A rejection the AI attributed to a business entity (or a listing the AI
  // flagged ineligible) gets a distinct, kind message instead of the generic
  // "try again" — re-uploading the same business document won't help.
  const businessBlocked =
    initial.ineligibleReason === BUSINESS_INELIGIBLE_REASON ||
    (status === "rejected" && initial.aiClassification === "business");

  function setDoc(i: number, patch: Partial<Doc>) {
    setDocs((d) => d.map((doc, idx) => (idx === i ? { ...doc, ...patch } : doc)));
  }
  function addDoc() {
    setDocs((d) => [...d, { url: "", label: "" }]);
  }
  function removeDoc(i: number) {
    setDocs((d) => (d.length === 1 ? d : d.filter((_, idx) => idx !== i)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const documents = docs
      .map((d) => ({ url: d.url.trim(), label: d.label.trim() }))
      .filter((d) => d.url && d.label && /^https?:\/\//.test(d.url));
    if (documents.length === 0) {
      setError(t("verifyOwnership.needDoc"));
      return;
    }
    start(async () => {
      const res = await fetch(`/api/listings/${listingId}/property-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, documentType: docType }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setError(t("verifyOwnership.error"));
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="kicker">{t("verifyOwnership.optional")}</p>
        {(ownerVerified || status === "approved") && (
          <OwnerVerifiedBadge label={t("ownerVerified.badge")} title={t("ownerVerified.tooltip")} />
        )}
      </div>
      <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">{t("verifyOwnership.heading")}</h1>
      <p className="text-[16px] mb-5" style={{ color: "var(--navy-2)" }}>
        {t("verifyOwnership.intro")}
      </p>

      {/* How verification works (DOK-186) — reassuring, plain language. */}
      <div className="surface-card p-5 mb-8" style={{ background: "var(--cream-2)" }}>
        <p className="font-mono text-[10px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
          {t("verifyOwnership.how.title")}
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "var(--navy-2)" }}>
          <li className="flex gap-2"><span aria-hidden>·</span><span>{t("verifyOwnership.how.ai")}</span></li>
          <li className="flex gap-2"><span aria-hidden>·</span><span>{t("verifyOwnership.how.docs")}</span></li>
          <li className="flex gap-2"><span aria-hidden>·</span><span>{t("verifyOwnership.how.tenant")}</span></li>
          <li className="flex gap-2"><span aria-hidden>·</span><span>{t("verifyOwnership.how.privacy")}</span></li>
          <li className="flex gap-2"><span aria-hidden>·</span><span>{t("verifyOwnership.how.privateOnly")}</span></li>
        </ul>
      </div>

      {businessBlocked && (
        <div
          className="surface-card p-6 mb-6"
          style={{ background: "var(--pink-light)" }}
        >
          <p className="font-display text-lg mb-2">{t("verifyOwnership.business.title")}</p>
          <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
            {t("verifyOwnership.business.body")}
          </p>
          <a href="mailto:support@swapl.com" className="pill-ghost inline-block">
            {t("verifyOwnership.business.contact")}
          </a>
        </div>
      )}

      {status !== "none" && !businessBlocked && (
        <div className="surface-card p-6 mb-6">
          <StatusBlock status={status} t={t} note={initial.note} />
        </div>
      )}

      {showForm && !businessBlocked && (
        <form onSubmit={submit} className="surface-card p-6 space-y-5">
          <fieldset>
            <legend className="block mb-2 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              {t("verifyOwnership.docType.label")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {(["deed", "lease", "other"] as DocType[]).map((dt) => (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setDocType(dt)}
                  aria-pressed={docType === dt}
                  className={docType === dt ? "pill-primary" : "pill-ghost"}
                >
                  {t(`verifyOwnership.docType.${dt}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--navy-3)" }}>
              {t("verifyOwnership.docType.hint")}
            </p>
          </fieldset>

          {docs.map((doc, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
              <label className="block text-sm">
                <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  {t("verifyOwnership.docLabel")}
                </span>
                <input
                  value={doc.label}
                  onChange={(e) => setDoc(i, { label: e.target.value })}
                  placeholder={t("verifyOwnership.docLabelPlaceholder")}
                  className="w-full px-3 py-2.5 rounded-lg border outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                />
              </label>
              <label className="block text-sm">
                <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  URL
                </span>
                <input
                  type="url"
                  value={doc.url}
                  onChange={(e) => setDoc(i, { url: e.target.value })}
                  placeholder={t("verifyOwnership.docUrlPlaceholder")}
                  className="w-full px-3 py-2.5 rounded-lg border outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                />
              </label>
              <button
                type="button"
                onClick={() => removeDoc(i)}
                disabled={docs.length === 1}
                className="pill-ghost disabled:opacity-40 shrink-0"
              >
                {t("verifyOwnership.remove")}
              </button>
            </div>
          ))}

          <button type="button" onClick={addDoc} className="pill-ghost">
            + {t("verifyOwnership.addDoc")}
          </button>

          <div className="flex items-center justify-end pt-2">
            <button type="submit" disabled={pending} className="pill-primary">
              {pending
                ? t("verifyOwnership.submitting")
                : status === "rejected"
                  ? t("verifyOwnership.resubmit")
                  : t("verifyOwnership.submit")}
            </button>
          </div>
          {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
        </form>
      )}
    </div>
  );
}

function StatusBlock({
  status,
  t,
  note,
}: {
  status: VerificationInitial["status"];
  t: ReturnType<typeof useT>;
  note: string | null;
}) {
  const map = {
    none: { label: "", body: "", bg: "var(--cream-2)", fg: "var(--navy-3)" },
    pending: {
      label: t("verifyOwnership.status.pending"),
      body: t("verifyOwnership.status.pendingBody"),
      bg: "var(--pink-light)",
      fg: "var(--pink)",
    },
    approved: {
      label: t("verifyOwnership.status.approved"),
      body: t("verifyOwnership.status.approvedBody"),
      bg: "var(--pink)",
      fg: "#fff",
    },
    rejected: {
      label: t("verifyOwnership.status.rejected"),
      body: t("verifyOwnership.status.rejectedBody"),
      bg: "var(--cream-2)",
      fg: "#dc2626",
    },
  }[status];

  return (
    <>
      <span
        className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full inline-block"
        style={{ background: map.bg, color: map.fg }}
      >
        {map.label}
      </span>
      <p className="mt-3 text-sm" style={{ color: "var(--navy-2)" }}>
        {map.body}
      </p>
      {note && status === "rejected" && (
        <p className="mt-2 text-sm" style={{ color: "var(--navy-3)" }}>
          <span className="font-mono text-[10px] uppercase tracking-[.08em]">{t("verifyOwnership.reviewerNote")}:</span>{" "}
          {note}
        </p>
      )}
    </>
  );
}
