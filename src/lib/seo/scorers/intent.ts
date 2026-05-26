import "server-only";
import { generateText, type LanguageModel } from "ai";

import type { Locale, SeoCriterionScore, SeoIntent } from "@/db/schema";
import type { SeoLocaleHeuristicsFull } from "../locale-heuristics-shared";

/**
 * LLM-based intent classifier + scorer.
 *
 * Two responsibilities:
 *
 *   1. `detectDocIntent(text, locale, model)` — classifies the document's
 *      search intent (informational / commercial / transactional /
 *      navigational). Uses a tiny LLM call (markdown output, tolerant
 *      parse). Pre-checks against the locale's trigger word lists; if
 *      they don't yield a confident signal, we ask the model.
 *
 *   2. `scoreIntent({ detected, expected })` — pure: 100 if they match,
 *      graded fall-off (60 for "close" pairs like commercial ↔
 *      transactional) otherwise.
 *
 * The auditor passes in the SERP-derived `expected` intent (Phase 1B
 * placeholder: we don't yet classify SERP intent — we use the locale's
 * trigger words against the primary keyword as the proxy). Phase 2 will
 * upgrade this to look at the actual SERP titles/h1s.
 */

const INTENT_VALUES = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const satisfies readonly SeoIntent[];

export interface IntentScorerInput {
  detected: SeoIntent;
  expected: SeoIntent;
}

export interface IntentDetails extends Record<string, unknown> {
  detected: SeoIntent;
  expected: SeoIntent;
}

/**
 * Score how well the doc's detected intent matches the SERP-implied
 * expected intent. Pure function.
 */
export function scoreIntent(input: IntentScorerInput): SeoCriterionScore {
  const details: IntentDetails = {
    detected: input.detected,
    expected: input.expected,
  };
  if (input.detected === input.expected) {
    return { score: 100, details };
  }
  // Close pairs: commercial ↔ transactional, informational ↔ navigational.
  const close: Record<SeoIntent, SeoIntent> = {
    commercial: "transactional",
    transactional: "commercial",
    informational: "navigational",
    navigational: "informational",
  };
  if (close[input.detected] === input.expected) {
    return { score: 60, details };
  }
  // Distant pairs: heavy penalty (commercial doc for an informational
  // query is a meaningful product gap).
  return { score: 25, details };
}

/**
 * Infer the expected intent for a query from the locale's trigger word
 * lists alone. Used as a SERP-intent proxy in V1. Returns the intent
 * if a trigger fires, otherwise null (caller falls back to LLM or
 * "informational").
 */
export function inferIntentFromKeyword(
  keyword: string,
  heuristics: SeoLocaleHeuristicsFull,
): SeoIntent | null {
  const lower = keyword.toLowerCase();
  const containsAny = (triggers: string[] | undefined): boolean => {
    if (!triggers) return false;
    for (const t of triggers) {
      const tl = t.toLowerCase();
      if (!tl) continue;
      if (lower.includes(tl)) return true;
    }
    return false;
  };
  if (containsAny(heuristics.commercialIntentTriggers)) {
    // Treat "buy / cena / купити" as transactional-leaning; "best / opinie"
    // as commercial. We can't tell from a flat list, so default to
    // commercial — Phase 2 will lean on SERP signals to split.
    return "commercial";
  }
  if (containsAny(heuristics.informationalIntentTriggers)) {
    return "informational";
  }
  return null;
}

const DETECT_SYSTEM = `You are a search-intent classifier for SEO copy auditing.

Read the document and return the dominant search intent for the content as if it were the answer to a Google query.

Categories (use exactly one):
- informational: explains, teaches, gives a guide / how-to / list. Reader is learning.
- commercial: evaluates products — comparisons, reviews, "best X", buyer's guide. Reader is shopping but not yet buying.
- transactional: drives a purchase / signup / download — landing pages, product pages, checkout copy. Reader is acting.
- navigational: brand / product page intended to surface for a brand-name query. Reader is looking for a specific destination.

OUTPUT FORMAT — VERY IMPORTANT.
Plain text. One word only — the category name. No code fences, no explanation, no extra prose.`;

function normalizeIntent(raw: string): SeoIntent | null {
  const s = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  for (const v of INTENT_VALUES) {
    if (s === v) return v;
  }
  if (s.startsWith("info")) return "informational";
  if (s.startsWith("commer")) return "commercial";
  if (s.startsWith("transact") || s === "buy" || s === "purchase")
    return "transactional";
  if (s.startsWith("nav") || s === "brand") return "navigational";
  return null;
}

/**
 * Classify the document's search intent via the resolved LLM. The model
 * is passed in (not resolved here) so the auditor can share one
 * `resolveModel` call across multiple sub-tasks.
 */
export async function detectDocIntent(args: {
  text: string;
  locale: Locale;
  model: LanguageModel;
}): Promise<SeoIntent> {
  const truncated = args.text.slice(0, 8000);
  const result = await generateText({
    model: args.model,
    system: DETECT_SYSTEM,
    prompt: `Document (locale=${args.locale}):\n\n${truncated}\n\nReturn one word.`,
    temperature: 0,
    maxOutputTokens: 12,
  });
  const parsed = normalizeIntent(result.text);
  return parsed ?? "informational";
}
