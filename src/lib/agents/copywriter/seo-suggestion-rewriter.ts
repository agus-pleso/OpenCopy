import "server-only";
import { z } from "zod";

import { defineAgent } from "../core";
import {
  renderVoiceCard,
  type Locale,
  type VoiceCardForPrompt,
} from "../voice-card";
import type { SeoSuggestionType } from "@/db/schema";

/**
 * SEO suggestion rewriter.
 *
 * Takes one SEO audit suggestion (type + description + optional excerpt) and
 * produces the actual `proposed` rewrite text, with brand voice injected.
 * Called lazily — only when the marketer hits "Apply" on a suggestion in the
 * diff preview modal. Suggestion shells from the auditor carry the intent
 * (what to change and why); this agent fills in the words.
 *
 * The agent is intentionally narrow:
 *  - rewrite_paragraph / tighten_section: edit the excerpt in place,
 *    preserving meaning + length-ish, working the primary keyword in
 *    naturally.
 *  - add_section: produce a full new section (heading + 1-3 paragraphs)
 *    on the topic the description specifies.
 *  - add_heading: produce a single H2 (or H3 if the description asks)
 *    matching the suggested topic.
 *  - add_lsi_keyword: produce a short paragraph naturally folding the
 *    LSI keyword(s) the description mentions into the surrounding voice.
 *
 * Voice fidelity matters here — Diana's whole point is that SEO suggestions
 * don't read like generic AI rewrites. If a voice is attached to the doc,
 * its card lands in the system prompt verbatim.
 */

export const SeoRewriteOutputSchema = z.object({
  proposed: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "The replacement / new text. PURE copy — no preamble, no markdown code fences, no 'Here is the rewrite:'. Match the brand voice if one is provided.",
    ),
  rationale: z
    .string()
    .min(5)
    .max(400)
    .describe(
      "One sentence on how this addresses the suggestion. Used as hover text in the diff modal.",
    ),
});

export type SeoRewriteOutput = z.infer<typeof SeoRewriteOutputSchema>;

export interface SeoSuggestionRewriterInput {
  voice: VoiceCardForPrompt | null;
  locale: Locale;
  primaryKeyword: string;
  secondaryKeywords: string[];
  suggestionType: SeoSuggestionType;
  suggestionDescription: string;
  /** Verbatim text from the doc the rewrite targets. Empty for add_*. */
  excerpt?: string;
}

const SYSTEM = `You are a senior SEO-aware copy editor. You take a single suggestion from an SEO audit and produce the actual replacement text.

Quality bar:
- If a brand voice card is provided, the output must read in that voice. Tone, persona, do/don't rules, and forbidden vocabulary all apply.
- The primary keyword should appear naturally — never keyword-stuffed. Once or twice in a paragraph is plenty.
- Preserve length and rhythm when rewriting an excerpt. Don't double the word count "because more content ranks better."
- Match the locale's reading conventions. Polish reads Polish (no transcreated English structure), Romanian reads Romanian, Ukrainian reads Ukrainian.
- Output is PURE replacement copy. No preamble, no markdown fences, no "Here is the rewrite". The diff modal feeds this directly back into the document.

Suggestion-type semantics:
- rewrite_paragraph: replace the excerpt with a stronger version that works the keyword in. Same paragraph count, similar length.
- tighten_section: shorten the excerpt by ~30-50% while keeping the substance. Output is the shorter version.
- add_section: produce a NEW section — start with a "## " heading and follow with 1-3 paragraphs. Topic comes from the description.
- add_heading: produce ONE heading line only (e.g. "## Pricing" or "### Common objections"), nothing else.
- add_lsi_keyword: produce a short paragraph (2-4 sentences) folding the LSI keyword(s) from the description into the brand voice naturally.

Output strictly conforms to the provided schema.`;

function buildPrompt(input: SeoSuggestionRewriterInput): string {
  const lines: string[] = [];

  if (input.voice) {
    lines.push(renderVoiceCard(input.voice, input.locale));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push(`Locale: ${input.locale}`);
  lines.push(`Primary keyword: ${input.primaryKeyword}`);
  if (input.secondaryKeywords.length > 0) {
    lines.push(`Secondary keywords: ${input.secondaryKeywords.join(", ")}`);
  }
  lines.push("");
  lines.push(`Suggestion type: ${input.suggestionType}`);
  lines.push(`Suggestion description: ${input.suggestionDescription}`);

  if (input.excerpt && input.excerpt.trim().length > 0) {
    lines.push("");
    lines.push("--- ORIGINAL EXCERPT ---");
    lines.push(input.excerpt);
    lines.push("--- END EXCERPT ---");
  }

  lines.push("");
  lines.push("Now produce the rewrite. Output strictly matches the schema.");

  return lines.join("\n");
}

export const seoSuggestionRewriter = defineAgent<
  SeoSuggestionRewriterInput,
  SeoRewriteOutput
>({
  name: "seo-suggestion-rewriter",
  description:
    "Turns a single SEO audit suggestion into actual replacement copy with brand voice.",
  modelRole: "drafting",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: SeoRewriteOutputSchema,
  temperature: 0.5,
  maxTokens: 2500,
});
