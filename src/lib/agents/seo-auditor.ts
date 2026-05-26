import "server-only";
import { generateText } from "ai";

import type {
  Locale,
  SeoCriterionScores,
  SeoIntent,
  SeoSuggestion,
} from "@/db/schema";

import { resolveModel } from "@/lib/ai/providers";
import {
  defaultLocaleHeuristics,
  type SeoLocaleHeuristicsFull,
} from "@/lib/seo/locale-heuristics-shared";
import { getLocaleHeuristics } from "@/lib/seo/locale-heuristics";
import { scoreContentGap } from "@/lib/seo/scorers/content-gap";
import { scoreDensity } from "@/lib/seo/scorers/density";
import {
  detectDocIntent,
  inferIntentFromKeyword,
  scoreIntent,
} from "@/lib/seo/scorers/intent";
import { scoreLength } from "@/lib/seo/scorers/length";
import { scoreReadability } from "@/lib/seo/scorers/readability";
import { scoreSemantic } from "@/lib/seo/scorers/semantic";
import { scoreStructure } from "@/lib/seo/scorers/structure";
import { fetchSerp, type SerpResult } from "@/lib/seo/serp-fetcher";

import { parseSeoAuditMarkdown, type ParsedSeoAudit } from "./seo-auditor-parser";

export { parseSeoAuditMarkdown } from "./seo-auditor-parser";

/* ----------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export interface SeoAuditorInput {
  docText: string;
  docHtml: string;
  keywordCluster: {
    primary: string;
    secondary: string[];
  };
  locale: Locale;
  workspaceId: string;
  voiceId?: string;
  /** Optional content-type hint (channel id, or "blog" default). */
  contentType?: string;
}

export interface SeoAuditorRunResult {
  output: {
    criterionScores: SeoCriterionScores;
    suggestions: SeoSuggestion[];
    detectedIntent: SeoIntent;
    compositeScore: number;
  };
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/* ----------------------------------------------------------------------------
 * Markdown prompt — produces the suggestions + intent. The criterion
 * scoring is mechanical; the LLM only sees an aggregate hint of what's
 * weak so it produces targeted suggestions.
 * -------------------------------------------------------------------------- */

const SYSTEM = `You are a senior SEO consultant reviewing a single piece of marketing copy.

Your job is to:
  1. Detect the document's dominant search intent (informational, commercial, transactional, or navigational).
  2. Produce concrete, actionable suggestions to improve the document's SEO performance for the target keyword.

You are NOT rewriting the copy — that happens later. Your suggestions are SHELLS describing what to change and why. The copywriter agent will fill in the actual replacement text. Each suggestion has:
  - a TYPE (one of: rewrite_paragraph, add_section, tighten_section, add_lsi_keyword, add_heading)
  - an optional EXCERPT (verbatim text from the document the change targets — leave blank for "add a new section" / "add a new heading")
  - a DESCRIPTION (one paragraph: what to change and why, grounded in the keyword + SERP signals)

Standards:
- Be specific. "Add a section" is useless; "Add an H2 section about pricing — five of the top SERP results include a pricing breakdown" is useful.
- Excerpts MUST appear VERBATIM in the document. Do not paraphrase.
- Prefer 3-7 suggestions. Skip filler.
- Suggestion types map to UI intents:
    * rewrite_paragraph — existing paragraph is wrong/weak. EXCERPT required.
    * tighten_section — existing section is bloated. EXCERPT required.
    * add_section — doc is missing a substantial topic. Use the description to define it.
    * add_heading — doc is flat-text and needs an H2/H3 anchor. Excerpt optional.
    * add_lsi_keyword — doc misses semantically-related vocabulary. List them in the description.

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN with the exact structure below. No code fences. No preamble.

## Detected intent
One word: informational, commercial, transactional, or navigational.

## Suggestions

### 1. <type>
Excerpt: <verbatim text or blank>
<one-paragraph description>

### 2. <type>
Excerpt: <verbatim text or blank>
<one-paragraph description>

(Continue for up to 7 suggestions.)`;

function summarizeScores(scores: SeoCriterionScores): string {
  const fmt = (label: string, s: { score: number }) =>
    `- ${label}: ${s.score}/100`;
  return [
    fmt("Density", scores.density),
    fmt("Semantic similarity", scores.semantic),
    fmt("Intent fit", scores.intent),
    fmt("Heading structure", scores.structure),
    fmt("Length", scores.length),
    fmt("Readability", scores.readability),
    fmt("Content gap vs top-10 SERP", scores.contentGap),
  ].join("\n");
}

function buildPrompt(args: {
  input: SeoAuditorInput;
  scores: SeoCriterionScores;
  detectedIntent: SeoIntent;
  expectedIntent: SeoIntent;
  serp: SerpResult[];
  heuristics: SeoLocaleHeuristicsFull;
}): string {
  const { input, scores, detectedIntent, expectedIntent, serp, heuristics } = args;
  const lines: string[] = [];
  lines.push(`Locale: ${input.locale} (${heuristics.searchDomain})`);
  lines.push(`Primary keyword: ${input.keywordCluster.primary}`);
  if (input.keywordCluster.secondary.length > 0) {
    lines.push(`Secondary keywords: ${input.keywordCluster.secondary.join(", ")}`);
  }
  lines.push(`Detected intent: ${detectedIntent}`);
  lines.push(`Expected intent (from keyword + SERP): ${expectedIntent}`);
  if (heuristics.notes) lines.push(`Locale notes: ${heuristics.notes}`);
  lines.push("");
  lines.push("Per-criterion scores:");
  lines.push(summarizeScores(scores));
  const gap = scores.contentGap.details as {
    missingTopics?: string[];
  };
  if (gap.missingTopics && gap.missingTopics.length > 0) {
    lines.push("");
    lines.push("Topics covered by 3+ top-SERP pages but MISSING from this doc:");
    for (const t of gap.missingTopics.slice(0, 8)) lines.push(`- ${t}`);
  }
  const structure = scores.structure.details as {
    headingTexts?: { h1: string[]; h2: string[]; h3: string[] };
  };
  if (structure.headingTexts) {
    lines.push("");
    lines.push("Current document headings:");
    lines.push(
      `H1: ${structure.headingTexts.h1.length === 0 ? "(none)" : structure.headingTexts.h1.join(" | ")}`,
    );
    lines.push(
      `H2: ${structure.headingTexts.h2.length === 0 ? "(none)" : structure.headingTexts.h2.join(" | ")}`,
    );
    if (structure.headingTexts.h3.length > 0) {
      lines.push(`H3: ${structure.headingTexts.h3.join(" | ")}`);
    }
  }
  if (serp.length > 0) {
    lines.push("");
    lines.push(`Top-${serp.length} SERP outlines (rank · title · h2s):`);
    for (const r of serp.slice(0, 6)) {
      lines.push(
        `${r.rank}. ${r.title}${r.h2.length > 0 ? " — " + r.h2.slice(0, 4).join(" / ") : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("--- DOCUMENT ---");
  lines.push(input.docText.slice(0, 12000));
  lines.push("--- END DOCUMENT ---");
  lines.push("");
  lines.push(
    "Now produce the SEO audit using the markdown format described in the system prompt. Stay specific.",
  );
  return lines.join("\n");
}

function compositeOf(scores: SeoCriterionScores): number {
  const all = [
    scores.density.score,
    scores.semantic.score,
    scores.intent.score,
    scores.structure.score,
    scores.length.score,
    scores.readability.score,
    scores.contentGap.score,
  ];
  return Math.round(all.reduce((a, b) => a + b, 0) / all.length);
}

/* ----------------------------------------------------------------------------
 * Orchestrator
 * -------------------------------------------------------------------------- */

export async function runSeoAuditor(
  input: SeoAuditorInput,
  // ctx: kept for call-signature parity with the voice agents. The
  // orchestrator itself doesn't need userId today (audit-report writes
  // happen in the server action layer). Phase 2 may use it for
  // attribution metadata on copywriter sub-calls.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: { userId: string },
): Promise<SeoAuditorRunResult> {
  const start = Date.now();

  // 1. Resolve the LLM up front so intent classification + suggestions
  //    share it.
  const { model, modelId, provider } = await resolveModel({
    workspaceId: input.workspaceId,
    // "critic" matches the voice auditor's role: cheaper than planning,
    // not as cheap as "fast" — appropriate for scoring + structured
    // markdown output.
    role: "critic",
  });

  // 2. Cheap pure scorers (sync).
  const heuristics = await getLocaleHeuristics(input.workspaceId, input.locale);

  const densityScore = scoreDensity({
    text: input.docText,
    primaryKeyword: input.keywordCluster.primary,
    secondaryKeywords: input.keywordCluster.secondary,
    locale: input.locale,
    targetRange: heuristics.targetKeywordDensityRange,
  });
  const structureScore = scoreStructure({ html: input.docHtml });
  const lengthScore = scoreLength({
    text: input.docText,
    contentType: input.contentType,
    locale: input.locale,
  });
  const readabilityScore = scoreReadability({
    text: input.docText,
    locale: input.locale,
  });

  // 3. Parallel: SERP fetch + doc intent detection + semantic embedding.
  const [serp, detectedIntent, semanticScore] = await Promise.all([
    fetchSerp({
      workspaceId: input.workspaceId,
      keyword: input.keywordCluster.primary,
      locale: input.locale,
    }).catch(() => [] as SerpResult[]),
    detectDocIntent({
      text: input.docText,
      locale: input.locale,
      model,
    }).catch((): SeoIntent => "informational"),
    scoreSemantic({
      text: input.docText,
      primaryKeyword: input.keywordCluster.primary,
      secondaryKeywords: input.keywordCluster.secondary,
    }),
  ]);

  // 4. Content gap (needs SERP outlines + embeddings — run after SERP).
  const contentGapScore = await scoreContentGap({
    text: input.docText,
    serpPages: serp.map((s) => ({
      url: s.url,
      title: s.title,
      h1: s.h1,
      h2: s.h2,
    })),
  });

  // 5. Intent score: compare detected against expected. Expected =
  //    locale-trigger inference; fall back to detected (charitable —
  //    can't penalise a doc when we don't know the SERP intent).
  const expectedIntent =
    inferIntentFromKeyword(input.keywordCluster.primary, heuristics) ??
    detectedIntent;
  const intentScore = scoreIntent({
    detected: detectedIntent,
    expected: expectedIntent,
  });

  // 6. Assemble per-criterion scores + composite.
  const criterionScores: SeoCriterionScores = {
    density: densityScore,
    semantic: semanticScore,
    intent: intentScore,
    structure: structureScore,
    length: lengthScore,
    readability: readabilityScore,
    contentGap: contentGapScore,
  };
  const compositeScore = compositeOf(criterionScores);

  // 7. Suggestion generation via LLM.
  const llmResult = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt({
      input,
      scores: criterionScores,
      detectedIntent,
      expectedIntent,
      serp,
      heuristics,
    }),
    temperature: 0.3,
    maxOutputTokens: 3000,
  });
  const parsed: ParsedSeoAudit = parseSeoAuditMarkdown(llmResult.text);

  // 8. Finalise suggestions as SeoSuggestion shells (no `proposed` yet —
  //    Phase 2 fills that on apply).
  const suggestions: SeoSuggestion[] = parsed.suggestions.map((s) => ({
    ...s,
    status: "pending",
  }));

  return {
    output: {
      criterionScores,
      suggestions,
      detectedIntent: parsed.detectedIntent ?? detectedIntent,
      compositeScore,
    },
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: llmResult.usage?.inputTokens,
      outputTokens: llmResult.usage?.outputTokens,
    },
  };
}

