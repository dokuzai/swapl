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
import { pt } from "./dict-pt";
import { nl } from "./dict-nl";
import { tr } from "./dict-tr";
import { zh } from "./dict-zh";
import { ar } from "./dict-ar";
import { ja } from "./dict-ja";
import { ro } from "./dict-ro";
import { el } from "./dict-el";
import { fa } from "./dict-fa";
import { th } from "./dict-th";
import { id } from "./dict-id";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  detectLocaleFromHeader,
  isLocale,
  type Locale,
} from "./locales";

// Partial registry: any locale missing here falls back to English at runtime.
// Currently every advertised locale ships a dict.
const RAW_DICTIONARIES: Partial<Record<Locale, Partial<Record<DictKey, string>>>> = { en, it, fr, de, es, pt, nl, tr, zh, ar, ja, ro, el, fa, th, id };

// Merge each non-English dictionary on top of English so missing or empty
// translations transparently use the English string.
const DICTIONARIES: Partial<Record<Locale, Record<DictKey, string>>> = Object.fromEntries(
  Object.entries(RAW_DICTIONARIES).map(([locale, dict]) => {
    const merged = { ...en } as Record<DictKey, string>;
    for (const [k, v] of Object.entries(dict ?? {})) {
      if (typeof v === "string" && v.length > 0) merged[k as DictKey] = v;
    }
    return [locale, merged];
  }),
) as Partial<Record<Locale, Record<DictKey, string>>>;

export async function getLocale(): Promise<Locale> {
  // cookies()/headers() throw at build time when there is no request scope
  // (e.g. while Next prerenders /_global-error). Quietly fall back to the
  // default locale instead of bringing the build down.
  try {
    const c = await cookies();
    const fromCookie = c.get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
    const h = await headers();
    return detectLocaleFromHeader(h.get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
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
