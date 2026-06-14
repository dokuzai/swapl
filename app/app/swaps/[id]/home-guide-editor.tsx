"use client";

// Home guide editor (DOK-152). Fetches the owner's guide from
// GET /api/listings/{id}/home-guide and saves partial edits via PUT. A
// completeness bar reflects the same core-field denominator the server uses.
// Used both standalone (on the listing) and embedded — collapsibly — in the
// trip cockpit for the user's own home.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";

const CORE_FIELDS = [
  "accessInstructions",
  "keyPickup",
  "wifiName",
  "wifiPassword",
  "heatingCooling",
  "kitchen",
  "bins",
  "petsPlants",
] as const;

const EXTRA_FIELDS = ["houseRules", "neighbourhood", "emergencyContact"] as const;

const ALL_FIELDS = [...CORE_FIELDS, ...EXTRA_FIELDS] as const;
type Field = (typeof ALL_FIELDS)[number];

type GuideResponse = {
  guide: (Record<Field, string | null> & { completeness: number }) | null;
  isOwner: boolean;
  locked: boolean;
};

export function HomeGuideEditor({
  listingId,
  collapsible = false,
}: {
  listingId: string;
  collapsible?: boolean;
}) {
  const t = useT();
  const [values, setValues] = useState<Record<Field, string>>(() =>
    Object.fromEntries(ALL_FIELDS.map((f) => [f, ""])) as Record<Field, string>,
  );
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/listings/${listingId}/home-guide`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GuideResponse;
      if (data.guide) {
        setValues(
          Object.fromEntries(ALL_FIELDS.map((f) => [f, data.guide![f] ?? ""])) as Record<Field, string>,
        );
      }
    } finally {
      setLoaded(true);
    }
  }, [listingId]);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  const completeness = useMemo(() => {
    const filled = CORE_FIELDS.filter((f) => values[f].trim() !== "").length;
    return Math.round((filled / CORE_FIELDS.length) * 100);
  }, [values]);

  function set(field: Field, v: string) {
    setValues((prev) => ({ ...prev, [field]: v }));
    if (state === "saved") setState("idle");
  }

  async function save() {
    setState("saving");
    try {
      const body = Object.fromEntries(
        ALL_FIELDS.map((f) => [f, values[f].trim() === "" ? null : values[f]]),
      );
      const res = await fetch(`/api/listings/${listingId}/home-guide`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setState("saved");
    } catch {
      setState("error");
    }
  }

  if (collapsible && !open) {
    return (
      <div className="surface-card p-5">
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setOpen(true)}
        >
          <span className="font-display text-lg tracking-[-0.01em]">{t("guide.title")}</span>
          <span className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
            {t("trip.guideEditor.open")} →
          </span>
        </button>
      </div>
    );
  }

  return (
    <section className="surface-card surface-card--static p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-display text-lg tracking-[-0.01em]">{t("guide.title")}</h3>
        <span className="font-mono text-[11px] tracking-[.04em] whitespace-nowrap" style={{ color: "var(--pink)" }}>
          {t("guide.completeness", { n: completeness })}
        </span>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
        {t("guide.lede")}
      </p>
      <div className="h-1.5 rounded-full overflow-hidden mb-5" style={{ background: "var(--line)" }}>
        <div className="h-full rounded-full" style={{ width: `${completeness}%`, background: "var(--pink)" }} />
      </div>

      {!loaded ? (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>…</p>
      ) : (
        <>
          <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
            {t("guide.section.core")}
          </div>
          <div className="space-y-3 mb-5">
            {CORE_FIELDS.map((f) => (
              <GuideField key={f} field={f} value={values[f]} onChange={set} short={f === "wifiName" || f === "wifiPassword"} />
            ))}
          </div>

          <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
            {t("guide.section.extra")}
          </div>
          <div className="space-y-3 mb-5">
            {EXTRA_FIELDS.map((f) => (
              <GuideField key={f} field={f} value={values[f]} onChange={set} short={f === "emergencyContact"} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" className="pill-primary" disabled={state === "saving"} onClick={save}>
              {state === "saving" ? t("guide.saving") : t("guide.save")}
            </button>
            {state === "saved" && (
              <span className="text-sm" style={{ color: "var(--pink)" }}>
                {t("guide.saved")}
              </span>
            )}
            {state === "error" && (
              <span className="text-sm" style={{ color: "var(--pink)" }}>
                {t("guide.error")}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function GuideField({
  field,
  value,
  onChange,
  short,
}: {
  field: Field;
  value: string;
  onChange: (f: Field, v: string) => void;
  short?: boolean;
}) {
  const t = useT();
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{t(`guide.field.${field}` as const)}</span>
      {short ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          maxLength={4000}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          rows={2}
          maxLength={4000}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
        />
      )}
    </label>
  );
}
