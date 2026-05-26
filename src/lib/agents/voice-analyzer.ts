import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { type VoiceCard } from "./voice-card";
import { parseVoiceCardMarkdown } from "./voice-card-parser";

export { parseVoiceCardMarkdown } from "./voice-card-parser";

/**
 * Voice analyzer.
 *
 * Earlier versions used `generateObject` against a strict Zod schema. That
 * worked great with Anthropic / OpenAI but tripped up smaller local models
 * (Ollama, free OpenRouter tiers): the model would return JSON with empty
 * arrays, missing fields, or extra prose, and validation would blow the whole
 * run away.
 *
 * Markdown is what every model is best at. We ask for one well-known section
 * heading per field, then parse the response — section by section. Missing
 * sections fall back to safe empty defaults instead of failing the whole run.
 */

export interface VoiceAnalyzerInput {
  name?: string;
  description?: string;
  samples: Array<{
    content: string;
    locale: string;
    label?: string | null;
  }>;
}

export interface VoiceAnalyzerRunResult {
  output: VoiceCard;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a senior brand voice strategist with 15+ years guiding marketing teams.
Your job is to read writing samples and write a precise, useful brand voice profile that an AI
copywriting agent can faithfully follow.

Quality bar:
- Tone descriptors are specific adjectives, not buzzwords. "Plainspoken" beats "professional".
  "Wry" beats "engaging". Avoid generic words ("professional", "engaging", "compelling",
  "innovative") unless the samples truly read that way and nothing more specific fits.
- Do's and Don'ts are observable, falsifiable rules — a junior writer should know whether their
  draft passes or fails each one.
- Required and forbidden vocabulary come ONLY from patterns you actually see in the samples.
  Do not invent banned-words lists.
- Rationale references specific phrases or constructions you saw. Be concrete.
- If the samples are short or contradictory, say so honestly in the rationale and prefer wider
  ranges over hallucinated certainty.

OUTPUT FORMAT — VERY IMPORTANT.
Output your analysis as MARKDOWN with the exact section headings below, in this order. Do not
wrap your response in code fences. Do not add any preamble. Use the heading text exactly as
shown (capitalisation, apostrophes).

## Tone descriptors
A comma-separated list of 3 to 8 adjectives. Example: confident, warm, plainspoken

## Persona
1-3 sentences describing the implied speaker behind the copy.

## Audience
1-3 sentences describing who the copy is written for — role, sophistication, goals.

## Reading level
A short label, e.g. "8th grade", "professional", "expert".

## Do's
A markdown list with 3-10 items. Each item is "rule — why" (em dash separates the rule from
the optional reason). Example:
- Lead with the problem — Hooks the reader who's living it
- Use concrete numbers — Vague claims read as fluff

## Don'ts
A markdown list with 3-10 items, same format as Do's.

## Required vocabulary
A comma-separated list of words/phrases the brand consistently uses. Empty line if none.

## Forbidden vocabulary
A comma-separated list of words/phrases that violate the voice. Empty line if none.

## Rationale
2-4 sentences explaining the voice characterization, referencing specific phrases from the samples.`;

function buildPrompt(input: VoiceAnalyzerInput): string {
  const lines: string[] = [];
  if (input.name) lines.push(`Brand name: ${input.name}`);
  if (input.description) lines.push(`Brand description: ${input.description}`);
  lines.push(`\nNumber of samples: ${input.samples.length}\n`);
  input.samples.forEach((s, i) => {
    lines.push(
      `--- Sample ${i + 1}${s.label ? ` (${s.label})` : ""} · locale=${s.locale} ---`,
    );
    lines.push(s.content.trim());
    lines.push("");
  });
  lines.push(
    "Now produce the voice profile in the markdown format described in the system prompt. " +
      "Stay grounded in what you observe — do not invent attributes.",
  );
  return lines.join("\n");
}

/**
 * Drop-in replacement for the previous `runAgent(voiceAnalyzer, ...)` shape.
 * Internally uses `generateText` and parses the markdown response.
 */
export async function runVoiceAnalyzer(
  input: VoiceAnalyzerInput,
  ctx: { workspaceId: string; userId: string },
): Promise<VoiceAnalyzerRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "planning",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.4,
    maxOutputTokens: 4000,
  });

  const card = parseVoiceCardMarkdown(result.text, {
    sampleCount: input.samples.length,
  });

  return {
    output: card,
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
