"use client";

// "Personal information" editor on /account (DOK-147): name, bio, work,
// languages (multi-input chips), home city + country. Saves via
// PATCH /api/profile (partial — only the touched fields travel).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n/client";
import type { ContactChannels } from "@/lib/contact-channels";
import { DatePickerSheet } from "@/components/ui/date-picker-sheet";

export type PersonalInfo = {
  name: string;
  bio: string;
  work: string;
  languages: string[];
  homeCity: string;
  homeCountry: string;
  /** ISO calendar date "YYYY-MM-DD", or null when unset. */
  dateOfBirth: string | null;
  contactChannels: ContactChannels;
};

const inputCls = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent";
const inputStyle = { borderColor: "var(--line)", background: "var(--card-bg)" } as const;

export function PersonalInfoEditor({ initial }: { initial: PersonalInfo }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState<PersonalInfo>(initial);
  const [langDraft, setLangDraft] = useState("");
  const [dobOpen, setDobOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dobLabel = form.dateOfBirth
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(`${form.dateOfBirth}T00:00:00`),
      )
    : t("account.personal.dobNotSet");

  function set<K extends keyof PersonalInfo>(key: K, value: PersonalInfo[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  function setChannel(key: keyof ContactChannels, value: string) {
    setForm((f) => ({ ...f, contactChannels: { ...f.contactChannels, [key]: value } }));
    setStatus("idle");
  }

  // Brand names (WhatsApp/Telegram/Instagram/Discord) are universal — no i18n key.
  const contactFields: { key: keyof ContactChannels; label: string; type: string }[] = [
    { key: "email", label: t("account.contact.email"), type: "email" },
    { key: "phone", label: t("account.contact.phone"), type: "tel" },
    { key: "whatsapp", label: "WhatsApp", type: "tel" },
    { key: "telegram", label: "Telegram", type: "text" },
    { key: "instagram", label: "Instagram", type: "text" },
    { key: "discord", label: "Discord", type: "text" },
    { key: "website", label: t("account.contact.website"), type: "url" },
  ];

  function addLanguage() {
    const lang = langDraft.trim();
    if (!lang || form.languages.length >= 10) return;
    if (form.languages.some((l) => l.toLowerCase() === lang.toLowerCase())) {
      setLangDraft("");
      return;
    }
    set("languages", [...form.languages, lang]);
    setLangDraft("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
          bio: form.bio.trim() || null,
          work: form.work.trim() || null,
          languages: form.languages,
          homeCity: form.homeCity.trim() || null,
          homeCountry: form.homeCountry.trim() || null,
          dateOfBirth: form.dateOfBirth,
          // Full-replace: server normalizes + drops empty/invalid values.
          contactChannels: form.contactChannels,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.personal.name")}
          </span>
          <input
            className={inputCls}
            style={inputStyle}
            value={form.name}
            maxLength={80}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.personal.work")}
          </span>
          <input
            className={inputCls}
            style={inputStyle}
            value={form.work}
            maxLength={120}
            placeholder={t("account.personal.workPlaceholder")}
            onChange={(e) => set("work", e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("account.personal.bio")}
        </span>
        <textarea
          className={inputCls}
          style={inputStyle}
          rows={3}
          maxLength={1000}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
        />
      </label>

      <div>
        <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("account.personal.languages")}
        </span>
        {form.languages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {form.languages.map((lang) => (
              <span key={lang} className="tag-chip inline-flex items-center gap-1.5" style={{ background: "var(--pink-light)", color: "var(--navy)" }}>
                {lang}
                <button
                  type="button"
                  aria-label={t("account.personal.remove", { item: lang })}
                  onClick={() => set("languages", form.languages.filter((l) => l !== lang))}
                  className="leading-none"
                  style={{ color: "var(--navy-2)" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            className={inputCls}
            style={inputStyle}
            value={langDraft}
            maxLength={40}
            placeholder={t("account.personal.languagePlaceholder")}
            onChange={(e) => setLangDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLanguage();
              }
            }}
          />
          <button
            type="button"
            onClick={addLanguage}
            disabled={!langDraft.trim() || form.languages.length >= 10}
            className="px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-60 shrink-0"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          >
            {t("account.personal.add")}
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.personal.homeCity")}
          </span>
          <input
            className={inputCls}
            style={inputStyle}
            value={form.homeCity}
            maxLength={80}
            onChange={(e) => set("homeCity", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.personal.homeCountry")}
          </span>
          <input
            className={inputCls}
            style={inputStyle}
            value={form.homeCountry}
            maxLength={80}
            onChange={(e) => set("homeCountry", e.target.value)}
          />
        </label>
      </div>

      {/* Date of birth — opens the iOS-style picker; the value rides along with
          the form's Save like every other field. */}
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("account.personal.dob")}
        </span>
        <button
          type="button"
          onClick={() => setDobOpen(true)}
          className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm text-left"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        >
          <span style={{ color: form.dateOfBirth ? "var(--navy)" : "var(--navy-3)" }}>{dobLabel}</span>
          <span aria-hidden style={{ color: "var(--navy-3)" }}>›</span>
        </button>
        <p className="text-sm mt-1.5" style={{ color: "var(--navy-2)" }}>{t("account.personal.dobBody")}</p>
      </div>

      {/* Mounted only while open so it re-seeds from the current value each time. */}
      {dobOpen && (
        <DatePickerSheet
          open
          value={form.dateOfBirth}
          onCancel={() => setDobOpen(false)}
          onConfirm={(iso) => {
            set("dateOfBirth", iso);
            setDobOpen(false);
          }}
        />
      )}

      <div>
        <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("account.contact.title")}
        </span>
        <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>{t("account.contact.hint")}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {contactFields.map((f) => (
            <label key={f.key} className="block">
              <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
                {f.label}
              </span>
              <input
                className={inputCls}
                style={inputStyle}
                type={f.type}
                value={form.contactChannels[f.key] ?? ""}
                maxLength={200}
                onChange={(e) => setChannel(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={status === "saving"} className="pill-ghost disabled:opacity-60">
          {status === "saving" ? t("account.personal.saving") : t("account.personal.save")}
        </button>
        {status === "saved" && (
          <span className="text-sm" style={{ color: "var(--navy-2)" }}>{t("account.personal.saved")}</span>
        )}
        {status === "error" && (
          <span className="text-sm" style={{ color: "#dc2626" }}>{t("account.personal.error")}</span>
        )}
      </div>
    </form>
  );
}
