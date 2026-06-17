"use client";

// Client-side i18n: a Context that holds the current locale + dictionary,
// hydrated from the server in the root layout. Use `useT()` in any client
// component for the same templating helper available server-side.

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { DictKey } from "./dict-en";
import type { Dict } from "./server";
import { localeDir, type Locale } from "./locales";

type Ctx = { locale: Locale; dict: Dict };

const I18nContext = createContext<Ctx | null>(null);

export function LocaleProvider({
  locale,
  dict,
  children,
}: Ctx & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  // The root layout is intentionally static (lang="en", no dir). Reflect the
  // resolved locale onto <html> here so Arabic/Farsi render right-to-left and
  // screen readers announce the correct language.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDir(locale);
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be inside <LocaleProvider>");
  return ctx;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

export function useT() {
  const { dict } = useI18n();
  return useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      const raw = dict[key] ?? key;
      if (!vars) return raw;
      return Object.entries(vars).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
        raw,
      );
    },
    [dict],
  );
}
