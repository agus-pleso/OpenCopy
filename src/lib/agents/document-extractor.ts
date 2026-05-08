import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { type VoiceCard } from "./voice-card";
import {
  parseKbHint,
  parseVoiceCardMarkdown,
  splitVoiceCardSections,
} from "./voice-card-parser";

/**
 * Tone-of-Voice document extractor.
 *
 * Sibling agent to `voice-analyzer.ts`. The analyzer reads writing SAMPLES and
 * infers a voice profile; this one reads an explicit Tone-of-Voice DOCUMENT
 * (the kind a marketing team writes by hand for designers / freelancers /
 * agencies) and extracts the same `VoiceCard` shape — plus locale-tagged
 * signature phrases, plus an optional hint when the document contains
 * factual / policy content that really belongs in the Knowledge base.
 *
 * Markdown output for the same reason the analyzer uses it: smaller models
 * trip on strict JSON schemas, and recoverable section-by-section parsing
 * lets us absorb partial responses gracefully.
 */

export interface DocumentExtractorInput {
  /** The raw Tone-of-Voice document content (already extracted from .docx etc). */
  documentText: string;
  /** Optional brand context if the user already filled in the basics. */
  name?: string;
  description?: string;
}

export interface DocumentExtractorRunResult {
  output: VoiceCard;
  /** Non-null when the model thinks parts of the document belong in Knowledge. */
  kbHint: { reason: string } | null;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a senior brand voice strategist. The user has handed you a brand's
official Tone-of-Voice document (the kind they'd give to a freelance copywriter or design
agency). Your job is to extract a structured voice profile from it that an AI copywriting
agent can faithfully follow.

Quality bar:
- Pull tone descriptors, do's, don'ts, audience description, reading level, vocabulary
  rules straight from the document. Do NOT invent attributes the document doesn't claim.
- If the document is silent on a field, leave it sparse rather than fill with generic
  filler ("professional", "engaging").
- Capture locale-tagged signature phrases (full sentences, canonical expressions, brand
  taglines) verbatim. The document may use multiple locales — surface each.
- If the document contains factual or policy content (product specs, pricing, FAQ
  answers, legal copy) that is NOT really about voice/tone, flag it under "KB hint" so
  the user can split that material into the Knowledge base instead. Do NOT include such
  content in the voice profile fields.

OUTPUT FORMAT — VERY IMPORTANT.
Output your extraction as MARKDOWN with the exact section headings below, in this order.
Do not wrap your response in code fences. Do not add any preamble. Use the heading text
exactly as shown.

## Tone descriptors
A comma-separated list of 3 to 8 adjectives. Example: confident, warm, plainspoken

## Persona
1-3 sentences describing the implied speaker behind the brand voice. Use what the
document says (or implies); say "the document does not specify" if it really doesn't.

## Audience
1-3 sentences. Pull directly from the document if it describes target audience; otherwise
say "the document does not specify".

## Reading level
A short label, e.g. "8th grade", "professional", "expert". One line.

## Do's
A markdown list with 3-10 items. Each item is "rule — why" (em dash separates rule from
optional reason). Example:
- Lead with the user's outcome — Hooks readers who self-identify with the problem
- Use second-person — Document explicitly says "always speak directly to 'you'"

## Don'ts
A markdown list with 3-10 items, same format as Do's.

## Required vocabulary
A comma-separated list of single words / short terms the brand uses (product names, signature
terms). Empty line if none. Distinct from signature phrases below.

## Forbidden vocabulary
A comma-separated list of words/phrases the document tells you NOT to use. Empty line if none.

## Signature phrases
Locale-tagged canonical expressions or full sentences the brand uses verbatim. Use exactly
this layout, with one subsection per locale present in the document. Skip locales not
covered by the document. Bullet items are quoted phrases.

### EN
- "First English signature phrase"
- "Second English phrase"

### PL
- "Polska fraza"

### RO
- "Frază românească"

### UK
- "Українська фраза"

If the document covers only one locale, output only that subsection. If no signature
phrases are present, write \`(none)\` under each locale heading you choose to include.

## Rationale
2-4 sentences explaining the extraction. Reference specific passages or wording from the
document. Be honest if the document is sparse on certain dimensions.

## KB hint
A single line. If the document mixes in factual / policy content (product specs, prices,
FAQ-style answers, legal copy) that doesn't belong in a voice profile, write:
\`yes — <one-sentence summary of what should move to Knowledge instead>\`
Otherwise write: \`no\``;

function buildPrompt(input: DocumentExtractorInput): string {
  const lines: string[] = [];
  if (input.name) lines.push(`Brand name: ${input.name}`);
  if (input.description) lines.push(`Brand description: ${input.description}`);
  lines.push("");
  lines.push("Tone-of-Voice document follows. Extract the voice profile in the markdown");
  lines.push("format described in the system prompt. Stay grounded in the document; do");
  lines.push("not invent attributes it doesn't claim.");
  lines.push("");
  lines.push("--- Tone-of-Voice document ---");
  lines.push(input.documentText.trim());
  lines.push("--- end of document ---");
  return lines.join("\n");
}

export async function runDocumentExtractor(
  input: DocumentExtractorInput,
  ctx: { workspaceId: string; userId: string },
): Promise<DocumentExtractorRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "planning",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.3,
    maxTokens: 4000,
  });

  const card = parseVoiceCardMarkdown(result.text, { sampleCount: 1 });
  const sections = splitVoiceCardSections(result.text);
  const kbHint = parseKbHint(sections.get("kb hint"));

  return {
    output: card,
    kbHint,
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
    },
  };
}
