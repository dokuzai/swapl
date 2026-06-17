// Supported UI locales for swapl.
//
// Adding a locale = (1) new dict-XX.ts, (2) entry in LOCALES,
// (3) the locale's BCP-47 prefix in detectLocaleFromHeader().

export const LOCALES = [
  "en", "it", "fr", "de", "es", "pt", "nl", "tr",
  "zh", "ar", "ja", "ro", "el", "fa", "th", "id",
] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
  nl: "Nederlands",
  tr: "Türkçe",
  zh: "中文",
  ar: "العربية",
  ja: "日本語",
  ro: "Română",
  el: "Ελληνικά",
  fa: "فارسی",
  th: "ไทย",
  id: "Bahasa Indonesia",
};

// Small flag glyphs for the locale-switcher chips. Pure unicode.
export const LOCALE_FLAG: Record<Locale, string> = {
  en: "🇬🇧",
  it: "🇮🇹",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  pt: "🇵🇹",
  nl: "🇳🇱",
  tr: "🇹🇷",
  zh: "🇨🇳",
  ar: "🇸🇦",
  ja: "🇯🇵",
  ro: "🇷🇴",
  el: "🇬🇷",
  fa: "🇮🇷",
  th: "🇹🇭",
  id: "🇮🇩",
};

// Right-to-left locales. The <html dir> is flipped for these (see client.tsx).
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar", "fa"]);

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Pulls the first BCP-47 tag whose primary subtag matches one of our
// supported locales. Falls back to DEFAULT_LOCALE if nothing matches.
export function detectLocaleFromHeader(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const tags = acceptLanguage
    .split(",")
    .map((t) => {
      const [tag, qPart] = t.trim().split(";");
      const q = qPart?.startsWith("q=") ? Number(qPart.slice(2)) : 1;
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

export const LOCALE_COOKIE = "swapl_locale";
