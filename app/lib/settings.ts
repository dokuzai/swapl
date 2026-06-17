// User settings (DOK-147), stored JSON-encoded in User.settings (TEXT —
// SQLite has no JSON type). A null column means "all defaults"; unknown keys
// from older/newer clients are dropped on read so the shape stays canonical.

export type UserSettings = {
  /** false → listings excluded from the sitemap + noindex on listing pages. */
  searchEngineIndexing: boolean;
  /** false → homeCity/homeCountry omitted from the public profile. */
  showHomeCity: boolean;
  /** Channel master switches — gate the controllable category flags below. */
  emailNotifications: boolean;
  pushNotifications: boolean;
  // Per-category switches (granular notifications). Each suppresses both the
  // push and the email for its event group on top of the channel masters.
  // Safety/trust categories (disputes, identity, verification) are always-on
  // and intentionally have no flag — see lib/notifications/categories.ts.
  notifyMessages: boolean;
  notifyProposals: boolean;
  notifyTrips: boolean;
  notifyReviews: boolean;
  notifyKeys: boolean;
  notifyRecommendations: boolean;
};

export const DEFAULT_SETTINGS: UserSettings = {
  searchEngineIndexing: true,
  showHomeCity: true,
  emailNotifications: true,
  pushNotifications: true,
  notifyMessages: true,
  notifyProposals: true,
  notifyTrips: true,
  notifyReviews: true,
  notifyKeys: true,
  notifyRecommendations: true,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[];

/** Parse the raw column. Tolerant: bad JSON / wrong types fall back to defaults. */
export function parseSettings(raw: string | null | undefined): UserSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of KEYS) {
      if (typeof parsed?.[key] === "boolean") out[key] = parsed[key] as boolean;
    }
  } catch {
    // ignore — defaults win
  }
  return out;
}

/** Merge a partial update over current settings and serialise for storage. */
export function mergeSettings(current: UserSettings, patch: Partial<UserSettings>): UserSettings {
  const next = { ...current };
  for (const key of KEYS) {
    if (typeof patch[key] === "boolean") next[key] = patch[key] as boolean;
  }
  return next;
}

export function serialiseSettings(settings: UserSettings): string {
  return JSON.stringify(settings);
}
