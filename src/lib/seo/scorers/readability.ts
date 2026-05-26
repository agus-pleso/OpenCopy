/**
 * Per-locale readability scorer.
 *
 * Formulas:
 *   - en: classic Flesch Reading Ease.
 *         RE = 206.835 − 1.015 × ASL − 84.6 × ASW
 *         where ASL = avg sentence length (words),
 *               ASW = avg syllables per word.
 *         Higher = easier. 90+ very easy, 60-70 plain English (target),
 *         <30 college-grade.
 *
 *   - pl: Pisarek formula (Polish reading ease, Pisarek 1969).
 *         T = 1/3 × (avg_sentence_len_words + percent_long_words)
 *         where "long" = ≥ 4 syllables.
 *         Lower T = easier; T~6 ≈ accessible newspaper, T~13 ≈ academic.
 *         Maps to 0-100 (inverse linear, 100 at T=1, 0 at T=20).
 *
 *   - ro: simplified score based on avg syllables-per-word + avg
 *         sentence length. No widely-canonical Romanian formula exists
 *         at AI-tool quality; mirror the shape of Flesch but tuned for
 *         Romanian (lower syllable target). Documented as best-effort.
 *
 *   - uk: simplified score in the same shape as ro. Cyrillic syllable
 *         counting via vowel-character heuristic. Same caveats.
 *
 * Pure function. No LLM, no DB.
 */

import type { Locale, SeoCriterionScore } from "@/db/schema";

export interface ReadabilityScorerInput {
  text: string;
  locale: Locale;
}

export interface ReadabilityDetails extends Record<string, unknown> {
  formula: string;
  raw: number;
  normalized: number;
  stats: {
    sentences: number;
    words: number;
    avgSentenceLength: number;
    avgSyllablesPerWord: number;
    longWordRatio: number;
  };
}

/**
 * Sentence split — handles `. ! ?` plus newlines as terminators. Defaults
 * to 1 sentence to avoid division-by-zero.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text.trim()].filter((s) => s.length > 0);
}

/**
 * Word tokenizer — multi-script aware. Returns lowercase words.
 */
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return matches ?? [];
}

/**
 * Estimate syllable count by counting vowel groups. Works across Latin
 * (incl. PL/RO diacritics) and Cyrillic (UK). Imperfect — diphthongs +
 * compound vowels skew slightly low — but consistent enough for the
 * readability formulas, which already trade exactness for robustness.
 */
export function countSyllables(word: string): number {
  if (!word) return 0;
  const lower = word.toLowerCase();
  // Vowel set across the four locales we care about.
  // Latin + PL/RO diacritics + Cyrillic vowels (UK).
  const vowelGroups = lower.match(/[aeiouyąęóáéíóúüöäåàèìòùâêîôûãõăâîșțа-яёє]+/gi);
  if (!vowelGroups) return 0;
  // Penalise trailing silent `e` in English/Romance words.
  let syl = vowelGroups.length;
  if (/[bcdfghjklmnpqrstvwxz]e$/i.test(lower) && syl > 1) {
    syl -= 1;
  }
  return Math.max(1, syl);
}

function stats(text: string): {
  sentences: number;
  words: number;
  avgSentenceLength: number;
  avgSyllablesPerWord: number;
  longWordRatio: number;
  longWordRatioFour: number;
} {
  const sentences = Math.max(1, splitSentences(text).length);
  const words = tokenizeWords(text);
  const wordCount = words.length || 1;
  const syllableCounts = words.map(countSyllables);
  const totalSyllables = syllableCounts.reduce((s, n) => s + n, 0);
  const longWordsFive = syllableCounts.filter((n) => n >= 5).length;
  const longWordsFour = syllableCounts.filter((n) => n >= 4).length;
  return {
    sentences,
    words: wordCount,
    avgSentenceLength: wordCount / sentences,
    avgSyllablesPerWord: totalSyllables / wordCount,
    longWordRatio: longWordsFive / wordCount,
    longWordRatioFour: longWordsFour / wordCount,
  };
}

/**
 * Map a "raw" formula output (where higher might mean easier OR harder
 * depending on the formula) into a normalised 0-100 SEO score.
 *
 * @param raw raw formula output
 * @param easyAt the raw value that should map to ~95 (very easy)
 * @param hardAt the raw value that should map to ~10 (very hard)
 */
function normalize(raw: number, easyAt: number, hardAt: number): number {
  const t = (raw - hardAt) / (easyAt - hardAt);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(10 + clamped * 85);
}

export function scoreReadability(
  input: ReadabilityScorerInput,
): SeoCriterionScore {
  const text = input.text || "";
  const s = stats(text);

  let raw: number;
  let normalized: number;
  let formula: string;

  switch (input.locale) {
    case "en": {
      // Flesch Reading Ease.
      raw =
        206.835 - 1.015 * s.avgSentenceLength - 84.6 * s.avgSyllablesPerWord;
      // 90+ = very easy, ~30 = college. Map to 0-100.
      normalized = Math.max(0, Math.min(100, Math.round(raw)));
      formula = "flesch";
      break;
    }
    case "pl": {
      // Pisarek: T = 1/3 × (avg sentence len + % long words [4+ syllables]).
      // Note: original formula uses long_words_ratio expressed as a
      // percentage (i.e., 0-100) on top of an avg sentence length in
      // words. We keep the same convention.
      raw =
        (1 / 3) * (s.avgSentenceLength + s.longWordRatioFour * 100);
      // T~6 = accessible; T~20 = academic.
      normalized = normalize(raw, /*easyAt=*/ 6, /*hardAt=*/ 20);
      formula = "pisarek";
      break;
    }
    case "ro": {
      // Simplified ro-specific score — shape mirrors Flesch but uses
      // Romanian-tuned constants (slightly higher syllable target since
      // Romanian words are typically 2-3 syllables vs English ~1.5).
      raw =
        206.835 -
        1.0 * s.avgSentenceLength -
        58 * Math.max(0, s.avgSyllablesPerWord - 0.5);
      normalized = Math.max(0, Math.min(100, Math.round(raw)));
      formula = "ro-simplified";
      break;
    }
    case "uk": {
      // Simplified uk-specific score. Cyrillic syllable counting via
      // vowel-group heuristic. Constants tuned for typical Ukrainian
      // content (longer words than English, slightly shorter sentences
      // than Polish).
      raw =
        206.835 -
        1.0 * s.avgSentenceLength -
        60 * Math.max(0, s.avgSyllablesPerWord - 0.5);
      normalized = Math.max(0, Math.min(100, Math.round(raw)));
      formula = "uk-simplified";
      break;
    }
  }

  return {
    score: normalized,
    details: {
      formula,
      raw: Math.round(raw * 100) / 100,
      normalized,
      stats: {
        sentences: s.sentences,
        words: s.words,
        avgSentenceLength: Math.round(s.avgSentenceLength * 100) / 100,
        avgSyllablesPerWord: Math.round(s.avgSyllablesPerWord * 100) / 100,
        longWordRatio: Math.round(s.longWordRatio * 1000) / 1000,
      },
    } satisfies ReadabilityDetails,
  };
}
