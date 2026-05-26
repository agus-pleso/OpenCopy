/**
 * Word-count vs target scorer.
 *
 * Piecewise function: too-short and way-too-long are both penalised.
 * Target windows come from the locale's `targetWordCounts` map, keyed by
 * content type (channel / blog / generic fallback).
 *
 * Diana's blog content lands around 1000 words; ig-post copy is ~80.
 * The locale defaults define both ends.
 *
 * Pure function. No LLM, no DB.
 */

import type { Locale, SeoCriterionScore } from "@/db/schema";
import { defaultLocaleHeuristics } from "../locale-heuristics-shared";
import { countWords } from "./density";

export interface LengthScorerInput {
  /** Plain-text doc body. */
  text: string;
  /** Channel key to look up in the locale's targetWordCounts map. Falls
   *  back to "blog" then "generic" if unknown. */
  contentType?: string;
  locale: Locale;
  /** Optional override of the target band. */
  target?: { min: number; ideal: number; max: number };
}

export interface LengthDetails extends Record<string, unknown> {
  words: number;
  target: { min: number; ideal: number; max: number };
  contentType: string;
}

/**
 * Resolve the target window for a content type, with sensible fallbacks.
 */
export function resolveLengthTarget(
  locale: Locale,
  contentType: string | undefined,
): { target: { min: number; ideal: number; max: number }; resolved: string } {
  const wordCounts = defaultLocaleHeuristics(locale).targetWordCounts;
  const key = contentType && contentType in wordCounts ? contentType : null;
  if (key) {
    return { target: wordCounts[key], resolved: key };
  }
  if ("blog" in wordCounts) {
    return { target: wordCounts.blog, resolved: "blog" };
  }
  return {
    target: wordCounts.generic ?? { min: 100, ideal: 500, max: 1500 },
    resolved: "generic",
  };
}

export function scoreLength(input: LengthScorerInput): SeoCriterionScore {
  const words = countWords(input.text || "");
  const { target, resolved } =
    input.target !== undefined
      ? {
          target: input.target,
          resolved: input.contentType ?? "(override)",
        }
      : resolveLengthTarget(input.locale, input.contentType);

  const details: LengthDetails = {
    words,
    target,
    contentType: resolved,
  };

  let score: number;
  if (words === 0) {
    score = 0;
  } else if (words < target.min) {
    // Too short. Linear from 0 (at words=0) to 80 (at min).
    score = (words / target.min) * 80;
  } else if (words <= target.ideal) {
    // Climbing from 80 (at min) to 100 (at ideal).
    const t = (words - target.min) / Math.max(1, target.ideal - target.min);
    score = 80 + t * 20;
  } else if (words <= target.max) {
    // Sliding from 100 (at ideal) to 80 (at max).
    const t = (words - target.ideal) / Math.max(1, target.max - target.ideal);
    score = 100 - t * 20;
  } else {
    // Over target.max. Linear fall-off; 0 at 2× max.
    const overflow = words - target.max;
    const t = Math.min(1, overflow / target.max);
    score = 80 * (1 - t);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    details,
  };
}
