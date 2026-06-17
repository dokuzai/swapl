// Non-"server-only" dictionary resolver for ROUTE HANDLERS.
//
// lib/i18n/server.ts is `import "server-only"` (it uses next/headers), which
// throws when a route module is imported by the test harness. Route handlers
// already receive the Request, so we resolve the locale straight off it — no
// next/headers, no server-only — and can be imported safely under vitest.

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
import { arPS } from "./dict-ar-ps";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  detectLocaleFromHeader,
  isLocale,
  type Locale,
} from "./locales";

type Dict = Record<DictKey, string>;

// Merge each locale on top of English so missing keys fall back to English —
// mirrors lib/i18n/server.ts.
const RAW: Record<Locale, Partial<Record<DictKey, string>>> = { en, it, fr, de, es, pt, nl, tr, zh, ar, ja, ro, el, fa, th, id, "ar-PS": arPS };
const DICTIONARIES: Record<Locale, Dict> = Object.fromEntries(
  Object.entries(RAW).map(([locale, dict]) => {
    const merged = { ...en } as Dict;
    for (const [k, v] of Object.entries(dict)) {
      if (typeof v === "string" && v.length > 0) merged[k as DictKey] = v;
    }
    return [locale, merged];
  }),
) as Record<Locale, Dict>;

export function localeFromRequest(req: Request): Locale {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  if (m) {
    const val = decodeURIComponent(m[1]);
    if (isLocale(val)) return val;
  }
  return detectLocaleFromHeader(req.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

export function dictionaryForRequest(req: Request): Dict {
  return DICTIONARIES[localeFromRequest(req)] ?? DICTIONARIES[DEFAULT_LOCALE];
}
