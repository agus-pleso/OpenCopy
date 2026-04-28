import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";

export const CulturalAdapterOutputSchema = z.object({
  notes: z
    .array(
      z.object({
        excerpt: z
          .string()
          .min(1)
          .max(400)
          .describe("The exact phrase from the source that needs adaptation. Verbatim."),
        category: z
          .enum([
            "idiom",
            "cultural_reference",
            "formality",
            "honorifics",
            "regional_term",
            "humor",
            "measurement_or_currency",
            "name_or_brand",
            "other",
          ])
          .describe("Why this needs special handling."),
        risk: z
          .enum(["low", "medium", "high"])
          .describe("How likely this is to mistranslate or land wrong without intervention."),
        guidance: z
          .string()
          .min(10)
          .max(400)
          .describe("Specific advice for the localizer — what to do, what to avoid, what's locale-appropriate."),
      }),
    )
    .max(20)
    .describe("Empty array if the source text translates cleanly."),
  formality_recommendation: z
    .string()
    .min(5)
    .max(220)
    .describe(
      "Brief recommendation on register/formality for the target locale (e.g. for PL: 'Use formal Pan/Pani in B2B contexts; informal ty for D2C consumer copy').",
    ),
  length_expectation: z
    .string()
    .min(5)
    .max(220)
    .describe(
      "How length will likely shift in the target language (PL/UA tend longer than EN; RO mid). Set drafter expectation.",
    ),
});

export type CulturalAdapterOutput = z.infer<typeof CulturalAdapterOutputSchema>;

export interface CulturalAdapterInput {
  voice?: VoiceCardForPrompt;
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  contextHint?: string;
}

const SYSTEM = `You are a transcreation strategist. Your job is to read source copy and identify \
everything that needs CULTURAL adaptation (not literal translation) for a target locale.

Quality bar:
- Only flag things that genuinely matter. A clean prose passage with no idioms or cultural references \
should produce an empty notes array. Resist over-flagging.
- Excerpts must appear verbatim in the source. No paraphrasing.
- Guidance is specific and actionable for a transcreator. "Translate carefully" is useless. \
"In PL B2B: use 'wyniki' instead of 'efekty'; the latter reads consumer-y" is actionable.
- Categorize correctly. An idiom is not the same as a cultural reference. Formality is not the same \
as honorifics.
- Formality recommendation should reflect the target-locale norms for the implied register of this \
copy, not just default to "formal" or "informal".
- Length expectation: be honest about how the target language will pack vs unpack the source.

Locales in scope: en (English), pl (Polish — formal Pan/Pani vs informal ty/wy distinction is \
critical), ro (Romanian — formal dumneavoastră vs informal tu), uk (Ukrainian — formal ви vs \
informal ти, plus war-context sensitivity around language choice).

Output strictly conforms to the provided schema.`;

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
    "\nIdentify what needs cultural adaptation. Be specific and surgical. Set the localizer up to make good calls.",
  );
  return lines.join("\n");
}

export const culturalAdapter = defineAgent<CulturalAdapterInput, CulturalAdapterOutput>({
  name: "localizer-cultural-adapter",
  description: "Identifies idioms, cultural references, formality, and length issues for transcreation.",
  modelRole: "critic",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: CulturalAdapterOutputSchema,
  temperature: 0.4,
  maxTokens: 2500,
});
