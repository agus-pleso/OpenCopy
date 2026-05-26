/**
 * Heading hierarchy scorer.
 *
 * Parses Tiptap-serialised HTML (the doc has `contentHtml` and
 * `contentText` columns; we work off the HTML so we can read headings).
 * Counts H1 / H2 / H3 and scores against simple SEO heuristics:
 *
 *   - H1 presence is the single highest signal. Exactly one wins.
 *   - 2-5 H2s structure the body for skim-readability + featured-snippet
 *     eligibility.
 *   - H3s are optional; they add nuance to deep H2 sections but their
 *     absence isn't penalised on shorter pieces.
 *
 * Pure function. No LLM, no DB.
 */

import type { SeoCriterionScore } from "@/db/schema";

export interface StructureScorerInput {
  /** Tiptap-serialised HTML. */
  html: string;
}

export interface StructureDetails extends Record<string, unknown> {
  h1: number;
  h2: number;
  h3: number;
  /** Extracted heading texts for downstream use (e.g., content-gap). */
  headingTexts: { h1: string[]; h2: string[]; h3: string[] };
}

/**
 * Extract heading text by tag from raw HTML. Strips inner tags + decodes
 * the cheap HTML entities. Lightweight regex parsing; the Tiptap HTML
 * shape is regular enough that a full parser is overkill.
 */
export function extractHeadings(
  html: string,
  tag: "h1" | "h2" | "h3",
): string[] {
  if (!html) return [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const innerHtml = m[1] ?? "";
    const text = innerHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

export function scoreStructure(input: StructureScorerInput): SeoCriterionScore {
  const html = input.html || "";
  const h1Texts = extractHeadings(html, "h1");
  const h2Texts = extractHeadings(html, "h2");
  const h3Texts = extractHeadings(html, "h3");
  const h1 = h1Texts.length;
  const h2 = h2Texts.length;
  const h3 = h3Texts.length;

  const details: StructureDetails = {
    h1,
    h2,
    h3,
    headingTexts: { h1: h1Texts, h2: h2Texts, h3: h3Texts },
  };

  // Heaviest signal: exactly one H1.
  let h1Score: number;
  if (h1 === 1) h1Score = 50;
  else if (h1 === 0) h1Score = 0;
  else h1Score = 20; // multiple H1s is bad SEO but slightly less bad than none

  // H2 structure: 2-5 is the sweet spot.
  let h2Score: number;
  if (h2 >= 2 && h2 <= 5) h2Score = 30;
  else if (h2 === 1) h2Score = 18;
  else if (h2 === 0) h2Score = 0;
  else if (h2 <= 8) h2Score = 22; // a few too many — still readable
  else h2Score = 12;

  // H3: optional but rewarded.
  let h3Score: number;
  if (h3 === 0) h3Score = 12; // not penalised
  else if (h3 <= 8) h3Score = 20;
  else h3Score = 14; // over-segmented

  const score = Math.max(0, Math.min(100, h1Score + h2Score + h3Score));

  return { score, details };
}
