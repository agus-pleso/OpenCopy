import "server-only";
import { defineAgent } from "./core";
import { VoiceCardSchema, type VoiceCard } from "./voice-card";

export interface VoiceAnalyzerInput {
  /** Optional name + description supplied by the user. Helps disambiguate. */
  name?: string;
  description?: string;
  samples: Array<{
    content: string;
    locale: string;
    label?: string | null;
  }>;
}

const SYSTEM = `You are a senior brand voice strategist with 15+ years guiding marketing teams. \
Your job is to read writing samples and extract a precise, useful brand voice profile that an \
AI copywriting agent can faithfully follow.

Quality bar:
- Tone descriptors are specific adjectives, not buzzwords. "Plainspoken" beats "professional". \
"Wry" beats "engaging". Avoid generic words ("professional", "engaging", "compelling", "innovative") \
unless the samples truly read that way and nothing more specific fits.
- Do's and Don'ts are observable, falsifiable rules — a junior writer should know whether their \
draft passes or fails each one.
- Required and forbidden words come ONLY from patterns you actually see in the samples (or that \
clearly violate them). Do not invent banned-words lists.
- Rationale references specific phrases or constructions you saw. Be concrete.
- If the samples are short or contradictory, say so honestly in the rationale and prefer wider \
ranges over hallucinated certainty.

Output strictly conforms to the provided schema.`;

function buildPrompt(input: VoiceAnalyzerInput): string {
  const lines: string[] = [];
  if (input.name) lines.push(`Brand name: ${input.name}`);
  if (input.description) lines.push(`Brand description: ${input.description}`);
  lines.push(`\nNumber of samples: ${input.samples.length}\n`);
  input.samples.forEach((s, i) => {
    lines.push(`--- Sample ${i + 1}${s.label ? ` (${s.label})` : ""} · locale=${s.locale} ---`);
    lines.push(s.content.trim());
    lines.push("");
  });
  lines.push(
    "Extract the brand voice that produced these samples. Stay grounded in what you observe — do not invent attributes.",
  );
  return lines.join("\n");
}

export const voiceAnalyzer = defineAgent<VoiceAnalyzerInput, VoiceCard>({
  name: "voice-analyzer",
  description: "Reads writing samples and extracts a structured brand voice profile.",
  modelRole: "planning",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: VoiceCardSchema,
  temperature: 0.4,
  maxTokens: 4000,
});
