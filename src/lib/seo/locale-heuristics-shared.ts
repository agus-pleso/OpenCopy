/**
 * Pure types + constants for SEO locale heuristics.
 *
 * Lives outside `server-only` so client code (UI tooltips, settings forms)
 * and smoke tests can import without dragging in the DB module.
 *
 * The DB-aware resolver — `getLocaleHeuristics(workspaceId, locale)` — lives
 * in `locale-heuristics.ts` (server-only). It reads workspace overrides
 * from `seo_locale_heuristics_override` and falls back to the constants
 * exported from here.
 */

import type { Locale, SeoLocaleHeuristics } from "@/db/schema";

/**
 * Extended locale heuristics — the auditor needs more than the schema's
 * interface exposes (intent triggers, etc.). The base `SeoLocaleHeuristics`
 * type covers the override-row jsonb shape; the extras are scorer-config
 * that doesn't currently live in DB. If users want to override one of the
 * extras later we can promote the field into the schema interface — for
 * V1 the overrides only touch the base fields.
 */
export interface SeoLocaleHeuristicsFull extends SeoLocaleHeuristics {
  /** Target keyword density window (as a fraction of total words). */
  targetKeywordDensityRange: { min: number; max: number };
  /**
   * Target word counts per channel/content type. Drives the `length`
   * scorer. Keys map to `channelEnum` values plus an "blog" / "generic"
   * fallback. Blog content for CEE locales is typically ~10-15% denser
   * than English equivalents.
   */
  targetWordCounts: Record<string, { min: number; ideal: number; max: number }>;
  /** Search domain for SERP scraping (google.com / google.pl / etc.). */
  searchDomain: string;
  /** `hl=` query parameter for google search (locale hint). */
  searchHlCode: string;
}

/* ----------------------------------------------------------------------------
 * Defaults per locale.
 *
 * Values seeded by best-guess + product judgment; the maintainer will
 * iterate as Diana's content lands real audit results. Non-obvious values
 * carry an inline comment explaining the call. CEE-specific behavior is
 * captured per locale (Polish queries skew longer; Romanian SEO is still
 * keyword-stuff-y; Ukrainian content typically lives on .com.ua with
 * mixed cyrillic+latin SERP).
 * -------------------------------------------------------------------------- */

const COMMON_WORD_COUNTS = {
  // Tight social formats — IG / FB / X-style.
  "ig-post": { min: 30, ideal: 80, max: 150 },
  "ig-story": { min: 10, ideal: 25, max: 50 },
  "fb-ad": { min: 40, ideal: 90, max: 150 },
  sms: { min: 10, ideal: 25, max: 40 },
  push: { min: 5, ideal: 10, max: 20 },
  // Email body.
  "email-marketing": { min: 80, ideal: 180, max: 350 },
  "email-transactional": { min: 50, ideal: 120, max: 200 },
  email: { min: 80, ideal: 180, max: 350 },
  // Landing copy.
  "landing-hero": { min: 30, ideal: 60, max: 120 },
  landing: { min: 200, ideal: 500, max: 1200 },
  // Long-form content (Diana's primary use case).
  blog: { min: 600, ideal: 1100, max: 2000 },
  ad: { min: 30, ideal: 80, max: 150 },
  social: { min: 30, ideal: 80, max: 150 },
  headline: { min: 5, ideal: 10, max: 20 },
  product_description: { min: 80, ideal: 200, max: 400 },
  other: { min: 100, ideal: 500, max: 2000 },
  // Catch-all when channel is missing.
  generic: { min: 100, ideal: 500, max: 1500 },
};

export const LOCALE_HEURISTICS_DEFAULTS: Record<Locale, SeoLocaleHeuristicsFull> = {
  en: {
    // English queries: industry-standard 3-4 token average per recent
    // SEMRush + Ahrefs studies.
    avgQueryTokens: 3,
    commercialIntentTriggers: [
      "buy",
      "best",
      "price",
      "cheap",
      "discount",
      "review",
      "vs",
      "compare",
      "deal",
      "near me",
      "for sale",
    ],
    informationalIntentTriggers: [
      "how",
      "what",
      "why",
      "when",
      "where",
      "guide",
      "tutorial",
      "examples",
      "tips",
      "ideas",
    ],
    notes:
      "English content tends to be slightly shorter than CEE equivalents. Reading-ease maps to Flesch (60+ readable).",
    // 1.0% - 2.5% is the industry standard "healthy" density window.
    targetKeywordDensityRange: { min: 0.01, max: 0.025 },
    targetWordCounts: COMMON_WORD_COUNTS,
    searchDomain: "google.com",
    searchHlCode: "en",
  },

  pl: {
    // Polish queries skew ~30% longer than English (per Senuto + GetTraffic
    // studies) — compound-noun grammar drives more tokens per intent.
    avgQueryTokens: 4,
    commercialIntentTriggers: [
      "kupić",
      "kupic",
      "cena",
      "ceny",
      "tanio",
      "tani",
      "promocja",
      "opinie",
      "ranking",
      "najlepszy",
      "porównanie",
      "porownanie",
      "rabat",
      "sklep",
    ],
    informationalIntentTriggers: [
      "jak",
      "co",
      "co to",
      "dlaczego",
      "kiedy",
      "gdzie",
      "poradnik",
      "instrukcja",
      "przykłady",
      "przyklady",
      "porady",
    ],
    notes:
      "Polish: queries skew longer, intent words are inflected (kup, kupić, kupować) — match on stem. Pisarek formula for readability.",
    // Polish blog norms allow tighter density — 1.2-2.8% — because
    // inflection naturally spreads keyword mass across morphological
    // variants.
    targetKeywordDensityRange: { min: 0.012, max: 0.028 },
    targetWordCounts: {
      ...COMMON_WORD_COUNTS,
      // Polish blog content runs ~10% longer than English to feel
      // "complete" to readers; comes through in Senuto rank correlations.
      blog: { min: 700, ideal: 1300, max: 2400 },
      "landing-hero": { min: 35, ideal: 70, max: 140 },
    },
    searchDomain: "google.pl",
    searchHlCode: "pl",
  },

  ro: {
    // Romanian: similar to Polish in length, slightly more keyword-stuff
    // tolerant per local SEO community.
    avgQueryTokens: 4,
    commercialIntentTriggers: [
      "cumpăra",
      "cumpara",
      "preț",
      "pret",
      "ieftin",
      "reducere",
      "ofertă",
      "oferta",
      "review",
      "recenzie",
      "comparație",
      "comparatie",
      "cel mai bun",
      "online",
    ],
    informationalIntentTriggers: [
      "cum",
      "ce",
      "ce este",
      "de ce",
      "când",
      "cand",
      "unde",
      "ghid",
      "tutorial",
      "exemple",
      "sfaturi",
    ],
    notes:
      "Romanian: include diacritic and non-diacritic forms for trigger matching (ț/t, ș/s). Simplified syllable-based readability.",
    // Romanian SEO community trends slightly higher density than English.
    targetKeywordDensityRange: { min: 0.012, max: 0.03 },
    targetWordCounts: {
      ...COMMON_WORD_COUNTS,
      blog: { min: 650, ideal: 1200, max: 2200 },
    },
    searchDomain: "google.ro",
    searchHlCode: "ro",
  },

  uk: {
    // Ukrainian: ~4 tokens average; sigificant code-switch with russian
    // remnants in older content but most fresh content is fully ukrainian.
    avgQueryTokens: 4,
    commercialIntentTriggers: [
      "купити",
      "купить",
      "ціна",
      "цена",
      "дешево",
      "знижка",
      "акція",
      "огляд",
      "відгуки",
      "відгук",
      "найкращий",
      "порівняння",
      "розпродаж",
    ],
    informationalIntentTriggers: [
      "як",
      "що",
      "що таке",
      "чому",
      "коли",
      "де",
      "інструкція",
      "посібник",
      "приклади",
      "поради",
    ],
    notes:
      "Ukrainian: SERP on google.com.ua (not .ua). Cyrillic-heavy; tokenization must respect non-Latin word boundaries. Simplified syllable-based readability.",
    targetKeywordDensityRange: { min: 0.012, max: 0.028 },
    targetWordCounts: {
      ...COMMON_WORD_COUNTS,
      blog: { min: 700, ideal: 1300, max: 2400 },
    },
    // Ukraine uses google.com.ua, not google.ua.
    searchDomain: "google.com.ua",
    searchHlCode: "uk",
  },
};

/**
 * Pure-function fallback. Returns the constants for the locale without
 * touching the DB. Useful in tests, the parser, and any client surface.
 */
export function defaultLocaleHeuristics(locale: Locale): SeoLocaleHeuristicsFull {
  return LOCALE_HEURISTICS_DEFAULTS[locale];
}

/**
 * Merge an override (which only carries the schema-typed subset of fields)
 * onto the locale's defaults. Non-overridden fields keep their default.
 */
export function mergeLocaleHeuristics(
  base: SeoLocaleHeuristicsFull,
  override: SeoLocaleHeuristics | null | undefined,
): SeoLocaleHeuristicsFull {
  if (!override) return base;
  return {
    ...base,
    avgQueryTokens: override.avgQueryTokens ?? base.avgQueryTokens,
    commercialIntentTriggers:
      override.commercialIntentTriggers ?? base.commercialIntentTriggers,
    informationalIntentTriggers:
      override.informationalIntentTriggers ??
      base.informationalIntentTriggers,
    notes: override.notes ?? base.notes,
  };
}
