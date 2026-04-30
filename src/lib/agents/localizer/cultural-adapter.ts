import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import {
  parseCulturalAdapterMarkdown,
  type CulturalAdapterOutput,
  type AdapterNote,
  type AdapterCategory,
  type AdapterRisk,
} from "./cultural-adapter-parser";

export {
  parseCulturalAdapterMarkdown,
  type CulturalAdapterOutput,
  type AdapterNote,
  type AdapterCategory,
  type AdapterRisk,
} from "./cultural-adapter-parser";

export interface CulturalAdapterInput {
  voice?: VoiceCardForPrompt;
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  contextHint?: string;
}

export interface CulturalAdapterRunResult {
  output: CulturalAdapterOutput;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a transcreation strategist. Your job is to read source copy and identify
everything that needs CULTURAL adaptation (not literal translation) for a target locale.

Quality bar:
- Only flag things that genuinely matter. A clean prose passage with no idioms or cultural
  references should produce zero notes. Resist over-flagging.
- Excerpts must appear verbatim in the source. No paraphrasing.
- Guidance is specific and actionable for a transcreator. "Translate carefully" is useless.
  "In PL B2B: use 'wyniki' instead of 'efekty'; the latter reads consumer-y" is actionable.
- Categorize correctly. An idiom is not the same as a cultural reference. Formality is not the
  same as honorifics.
- Formality recommendation reflects the target-locale norms for the implied register, not just
  default to "formal" or "informal".
- Length expectation: be honest about how the target language will pack vs unpack the source.

Locales in scope: en (English), pl (Polish — formal Pan/Pani vs informal ty/wy distinction is
critical), ro (Romanian — formal dumneavoastră vs informal tu), uk (Ukrainian — formal ви vs
informal ти, plus war-context sensitivity around language choice).

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN. No code fences, no preamble. Use these exact section headings:

## Formality
1-2 sentences with the formality recommendation for the target locale.

## Length expectation
1-2 sentences on how length will likely shift in the target language.

## Notes
Zero or more issues, each as a level-3 heading with severity and category, then fields.
If the source translates cleanly, leave this section empty (just the heading).

### high · idiom
**Excerpt:** "the exact phrase from the source"
**Guidance:** specific, actionable advice for the transcreator

### medium · formality
**Excerpt:** "..."
**Guidance:** ...

(Severity values: high, medium, low. Categories: idiom, cultural_reference, formality,
honorifics, regional_term, humor, measurement_or_currency, name_or_brand, other.)`;

function buildPrompt(input: CulturalAdapterInput): string {
  const lines: string[] = [];
  if (input.voice) {
    lines.push(renderVoiceCard(input.voice));
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(`Source locale: ${input.sourceLocale}`);
  lines.push(`Target locale: ${input.targetLocale}`);
  if (input.contextHint) {
    lines.push(`Context: ${input.contextHint}`);
  }
  lines.push(`\nSource text:\n${input.sourceText.trim()}`);
  lines.push(
    "\nIdentify what needs cultural adaptation using the markdown format described in the system prompt. Be specific and surgical.",
  );
  return lines.join("\n");
}

export async function runCulturalAdapter(
  input: CulturalAdapterInput,
  ctx: { workspaceId: string; userId: string },
): Promise<CulturalAdapterRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "critic",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.4,
    maxTokens: 2500,
  });

  return {
    output: parseCulturalAdapterMarkdown(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
    },
  };
}
