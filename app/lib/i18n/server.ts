// Server-side locale resolver. Order:
//   1. swapl_locale cookie (set when user picks one explicitly)
//   2. Accept-Language header (browser default)
//   3. DEFAULT_LOCALE (en)
//
// Then loads the matching dictionary. Used in every server component via
// getDictionary() and in API routes via getLocale(req).

import "server-only";
import { cookies, headers } from "next/headers";
import { en, type DictKey } from "./dict-en";
import { it } from "./dict-it";
import { fr } from "./dict-fr";
import { de } from "./dict-de";
import { es } from "./dict-es";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  detectLocaleFromHeader,
  isLocale,
  type Locale,
} from "./locales";

// Partial registry: locales without a shipped dict (currently pt, nl) fall
// back to English at runtime. Lets us advertise the full locale list while
// translations roll out incrementally.
const DICTIONARIES: Partial<Record<Locale, Record<DictKey, string>>> = { en, it, fr, de, es };

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const fromCookie = c.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const h = await headers();
  return detectLocaleFromHeader(h.get("accept-language"));
}

export type Dict = Record<DictKey, string>;

// `en` is the only guaranteed fallback — it's the source of every key.
function fallbackEn(): Dict {
  return en;
}

export async function getDictionary(locale?: Locale): Promise<Dict> {
  const l = locale ?? (await getLocale());
  return DICTIONARIES[l] ?? fallbackEn();
}

// Convenience: returns both. Server pages and components typically call
// `const { locale, dict } = await getI18n()` once at the top.
export async function getI18n(): Promise<{ locale: Locale; dict: Dict }> {
  const locale = await getLocale();
  const dict = DICTIONARIES[locale] ?? fallbackEn();
  return { locale, dict };
}

// Tiny templating helper: turns "Pagina {n} di {total}" into "Pagina 2 di 7".
// Always quietly tolerates missing keys (returns the key as fallback).
export function t(dict: Dict, key: DictKey, vars?: Record<string, string | number>): string {
  const raw = dict[key] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    raw,
  );
}
