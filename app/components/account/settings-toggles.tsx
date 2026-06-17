"use client";

// Privacy + notification switches on /account (DOK-147). Each row PATCHes
// /api/profile/settings independently (partial merge server-side) with an
// optimistic flip that reverts on failure.

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { UserSettings } from "@/lib/settings";
import type { DictKey } from "@/lib/i18n/dict-en";

function SettingToggleRow({
  settingKey,
  titleKey,
  bodyKey,
  initial,
}: {
  settingKey: keyof UserSettings;
  titleKey: DictKey;
  bodyKey: DictKey;
  initial: boolean;
}) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setError(false);
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [settingKey]: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOn(!next); // revert
      setError(true);
    }
  }

  return (
    <div className="py-4 flex items-start justify-between gap-4 border-t first:border-t-0" style={{ borderColor: "var(--line)" }}>
      <div>
        <p className="text-sm font-medium">{t(titleKey)}</p>
        <p className="text-sm mt-0.5" style={{ color: "var(--navy-2)" }}>
          {t(bodyKey)}
        </p>
        {error && (
          <p className="text-sm mt-1" style={{ color: "#dc2626" }}>
            {t("account.privacy.error")}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t(titleKey)}
        onClick={toggle}
        className="relative shrink-0 w-11 h-6 rounded-full transition-colors mt-0.5"
        style={{ background: on ? "var(--navy)" : "var(--cream-2)", border: "1px solid var(--line)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
          style={{ left: on ? 22 : 2, background: on ? "var(--cream)" : "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.18)" }}
        />
      </button>
    </div>
  );
}

export function PrivacyToggles({ initial }: { initial: UserSettings }) {
  return (
    <div>
      <SettingToggleRow
        settingKey="searchEngineIndexing"
        titleKey="account.privacy.indexing"
        bodyKey="account.privacy.indexingBody"
        initial={initial.searchEngineIndexing}
      />
      <SettingToggleRow
        settingKey="showHomeCity"
        titleKey="account.privacy.showHomeCity"
        bodyKey="account.privacy.showHomeCityBody"
        initial={initial.showHomeCity}
      />
    </div>
  );
}

// Per-category switches (granular notifications). settingKey/titleKey/bodyKey
// stay in lock-step with lib/notifications/categories.ts CONTROLLABLE_CATEGORIES.
const CATEGORY_ROWS: {
  settingKey: keyof UserSettings;
  titleKey: DictKey;
  bodyKey: DictKey;
}[] = [
  { settingKey: "notifyMessages", titleKey: "account.notifications.messages", bodyKey: "account.notifications.messagesBody" },
  { settingKey: "notifyProposals", titleKey: "account.notifications.proposals", bodyKey: "account.notifications.proposalsBody" },
  { settingKey: "notifyTrips", titleKey: "account.notifications.trips", bodyKey: "account.notifications.tripsBody" },
  { settingKey: "notifyReviews", titleKey: "account.notifications.reviews", bodyKey: "account.notifications.reviewsBody" },
  { settingKey: "notifyKeys", titleKey: "account.notifications.keys", bodyKey: "account.notifications.keysBody" },
  { settingKey: "notifyRecommendations", titleKey: "account.notifications.recommendations", bodyKey: "account.notifications.recommendationsBody" },
];

export function NotificationToggles({ initial }: { initial: UserSettings }) {
  const t = useT();
  return (
    <div>
      {/* Channel master switches */}
      <SettingToggleRow
        settingKey="emailNotifications"
        titleKey="account.notifications.email"
        bodyKey="account.notifications.emailBody"
        initial={initial.emailNotifications}
      />
      <SettingToggleRow
        settingKey="pushNotifications"
        titleKey="account.notifications.push"
        bodyKey="account.notifications.pushBody"
        initial={initial.pushNotifications}
      />

      {/* Per-category switches */}
      <p className="text-xs font-semibold uppercase tracking-wide pt-6 pb-1" style={{ color: "var(--navy-2)" }}>
        {t("account.notifications.categoriesTitle")}
      </p>
      {CATEGORY_ROWS.map((row) => (
        <SettingToggleRow
          key={row.settingKey}
          settingKey={row.settingKey}
          titleKey={row.titleKey}
          bodyKey={row.bodyKey}
          initial={initial[row.settingKey]}
        />
      ))}
      <p className="text-sm pt-4" style={{ color: "var(--navy-2)" }}>
        {t("account.notifications.safetyNote")}
      </p>
    </div>
  );
}
