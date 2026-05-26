/**
 * Keyword density scorer.
 *
 * Counts primary + secondary keyword occurrences (case-insensitive,
 * word-boundary aware, locale-tolerant for Cyrillic + Polish/Romanian
 * diacritics) in the document text. Scores against the locale's target
 * density window.
 *
 * Pure function. No LLM, no DB. Imported by `seo-auditor.ts`.
 *
 * Scoring shape:
 *   - inside the window (min..max): full marks (100), with a small bonus
 *     for landing in the middle of the range.
 *   - below window: linear penalty, 0 marks at 0%.
 *   - above window: linear penalty, 0 marks at 2× the upper bound (we
 *     don't want to nuke a slightly-over-stuffed page completely — gives
 *     the scorer headroom to penalise truly egregious stuffing).
 */

import type { Locale, SeoCriterionScore } from "@/db/schema";
import { defaultLocaleHeuristics } from "../locale-heuristics-shared";

export interface DensityScorerInput {
  /** Plain-text doc body. */
  text: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
  locale: Locale;
  /** Optional override of the target window (otherwise pulled from locale defaults). */
  targetRange?: { min: number; max: number };
}

export interface DensityDetails extends Record<string, unknown> {
  /** Total words in the doc (used as denominator). */
  totalWords: number;
  /** Total keyword occurrences (primary + secondary, deduped by surface). */
  count: number;
  /** Occurrence count for the primary keyword only. */
  primaryCount: number;
  /** Occurrence count summed across all secondary keywords. */
  secondaryCount: number;
  /** Ratio of count / totalWords (a value, not a %). */
  ratio: number;
  target: { min: number; max: number };
}

/**
 * Tokenise text into "words". Handles Latin (with diacritics), Cyrillic,
 * and basic Hangul/CJK conservatively. Underscore is treated as part of a
 * word, hyphen as a separator (per SEO convention — "kid-friendly" is
 * two words to a search engine when matched as a keyword).
 */
export function countWords(text: string): number {
  if (!text) return 0;
  // \p{L} = any letter (any script), \p{N} = any number. We split on
  // anything else.
  const matches = text.match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

/**
 * Count case-insensitive occurrences of `phrase` in `haystack`, with word
 * boundaries on either side. Multi-word phrases are matched as a whole
 * (so "wygodne buty" doesn't double-count if "buty wygodne" also appears).
 */
export function countPhraseOccurrences(haystack: string, phrase: string): number {
  if (!phrase || !haystack) return 0;
  const cleaned = phrase.trim().toLowerCase();
  if (!cleaned) return 0;

  // Escape regex metachars in the phrase.
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Word boundary equivalent that works across scripts: lookarounds for
  // non-letter/non-digit (or start/end of string).
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const matches = haystack.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Score the density. Range is fraction-of-total-words (e.g. 0.012 = 1.2%).
 */
export function scoreDensity(input: DensityScorerInput): SeoCriterionScore {
  const range =
    input.targetRange ??
    defaultLocaleHeuristics(input.locale).targetKeywordDensityRange;

  const text = input.text || "";
  const totalWords = countWords(text);

  const primaryCount = countPhraseOccurrences(text, input.primaryKeyword);
  const secondaryCount = (input.secondaryKeywords ?? []).reduce(
    (sum, kw) => sum + countPhraseOccurrences(text, kw),
    0,
  );
  const count = primaryCount + secondaryCount;
  const ratio = totalWords > 0 ? count / totalWords : 0;

  const details: DensityDetails = {
    totalWords,
    count,
    primaryCount,
    secondaryCount,
    ratio,
    target: range,
  };

  // Edge cases.
  if (totalWords === 0) {
    return { score: 0, details };
  }
  if (count === 0) {
    return { score: 0, details };
  }
  if (!input.primaryKeyword || !input.primaryKeyword.trim()) {
    // No primary keyword to anchor to: return whatever the ratio implies
    // but cap the confidence.
    return { score: 50, details };
  }

  let score: number;
  if (ratio >= range.min && ratio <= range.max) {
    // Inside the window. Reward landing near the middle.
    const mid = (range.min + range.max) / 2;
    const halfSpan = (range.max - range.min) / 2;
    const distance = Math.abs(ratio - mid);
    // Within-window: 90 at edges, 100 in middle.
    score = 100 - (distance / halfSpan) * 10;
  } else if (ratio < range.min) {
    // Below the window. 0 at ratio=0, 90 just below the min.
    score = (ratio / range.min) * 90;
  } else {
    // Above the window. Linear fall-off; 0 at 2× the upper bound.
    const overflow = ratio - range.max;
    const upperCap = range.max; // distance from max to 0 score
    const t = Math.min(1, overflow / upperCap);
    score = 90 * (1 - t);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    details,
  };
}
