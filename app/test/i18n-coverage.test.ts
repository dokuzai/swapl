import { describe, expect, it } from "vitest";
import { en, type DictKey } from "@/lib/i18n/dict-en";
import { fr } from "@/lib/i18n/dict-fr";
import { it as itDict } from "@/lib/i18n/dict-it";
import { nl } from "@/lib/i18n/dict-nl";
import { de } from "@/lib/i18n/dict-de";
import { es } from "@/lib/i18n/dict-es";
import { pt } from "@/lib/i18n/dict-pt";
import { tr } from "@/lib/i18n/dict-tr";
import { zh } from "@/lib/i18n/dict-zh";
import { ar } from "@/lib/i18n/dict-ar";
import { ja } from "@/lib/i18n/dict-ja";
import { ro } from "@/lib/i18n/dict-ro";
import { el } from "@/lib/i18n/dict-el";
import { fa } from "@/lib/i18n/dict-fa";
import { th } from "@/lib/i18n/dict-th";
import { id } from "@/lib/i18n/dict-id";

const locales: Record<string, Partial<Record<DictKey, string>>> = {
  fr,
  it: itDict,
  nl,
  de,
  es,
  pt,
  tr,
  zh,
  ar,
  ja,
  ro,
  el,
  fa,
  th,
  id,
};

// Keys where falling back to the English string is intentional (e.g. strings
// that are identical in every language). Add a key here only when the English
// value is genuinely universal — never to paper over a missing translation.
const FALLBACK_ALLOWLIST: ReadonlySet<DictKey> = new Set<DictKey>([]);

// Keys that are legitimately empty in some locales because the sentence is
// assembled from several keys and the word order differs from English
// (e.g. fr/it/de/es fold "mutual swaps" entirely into filter.mutualEm).
const EMPTY_OK: ReadonlySet<DictKey> = new Set<DictKey>(["filter.mutualSwaps"]);

const enKeys = Object.keys(en) as DictKey[];

// Extracts {placeholder} tokens so we can check translations keep them intact.
const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();

describe("i18n dictionary coverage", () => {
  for (const [locale, dict] of Object.entries(locales)) {
    it(`dict-${locale} has every key from dict-en (minus allowlist)`, () => {
      const missing = enKeys.filter(
        (k) => !(k in dict) && !FALLBACK_ALLOWLIST.has(k),
      );
      expect(
        missing,
        `dict-${locale}.ts is missing ${missing.length} key(s) present in dict-en.ts. ` +
          `Translate them (or, if the English fallback is intentional, add them to ` +
          `FALLBACK_ALLOWLIST in test/i18n-coverage.test.ts).`,
      ).toEqual([]);
    });

    it(`dict-${locale} has no keys that don't exist in dict-en`, () => {
      const extra = Object.keys(dict).filter(
        (k) => !(k in en),
      );
      expect(extra, `dict-${locale}.ts has stale key(s) not in dict-en.ts.`).toEqual([]);
    });

    it(`dict-${locale} keeps {placeholders} intact`, () => {
      for (const [key, value] of Object.entries(dict) as [DictKey, string][]) {
        expect(
          placeholders(value),
          `dict-${locale}.ts "${key}" placeholders differ from dict-en.ts`,
        ).toEqual(placeholders(en[key]));
      }
    });

    it(`dict-${locale} has no empty strings`, () => {
      for (const [key, value] of Object.entries(dict) as [DictKey, string][]) {
        if (EMPTY_OK.has(key)) continue;
        expect(value.trim(), `dict-${locale}.ts "${key}" is empty`).not.toBe("");
      }
    });
  }
});
