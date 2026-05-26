/**
 * Tolerant parser for the per-tool deep-dive agents (SEO + Localizer).
 *
 * Each turn is a short markdown block:
 *
 *     ## Question
 *     <the question to ask>
 *
 *     ## Complete             (optional — only when the agent decides the
 *                              deep-dive is done; the value is "yes")
 *
 * V1 deep-dives just persist the transcript — data integration with the
 * downstream agent is a follow-up session. So the parser only needs to
 * surface the question and a `complete` flag. The transcript itself is the
 * load-bearing artifact.
 */

import {
  findSectionLike,
  splitSections,
  unwrapMarkdown,
} from "./markdown-helpers";

export interface DeepDiveTurn {
  question: string;
  complete: boolean;
}

export function parseDeepDiveTurnMarkdown(raw: string): DeepDiveTurn {
  const cleaned = unwrapMarkdown(raw);
  const sections = splitSections(cleaned);

  const qSection = findSectionLike(sections, ["question", "next question", "ask"]);
  const completeSection = findSectionLike(sections, [
    "complete",
    "done",
    "finished",
  ]);

  const question =
    (qSection?.body ?? "").trim() ||
    cleaned.replace(/^#.*$/gm, "").trim() ||
    "(missing question)";

  const complete = (() => {
    const body = completeSection?.body?.trim().toLowerCase();
    if (!body) return false;
    return /^(yes|y|true|complete|done)\b/.test(body);
  })();

  return { question, complete };
}
