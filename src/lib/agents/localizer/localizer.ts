import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import type { CulturalAdapterOutput } from "./cultural-adapter";

export const LocalizerOutputSchema = z.object({
  target_text: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "The transcreated copy in the target locale. PURE copy — no preamble, no 'Here's the translation:', no markdown fences.",
    ),
  decisions: z
    .array(
      z.object({
        source_excerpt: z.string().min(1).max(400),
        target_excerpt: z.string().min(1).max(400),
        rationale: z
          .string()
          .min(10)
          .max(300)
          .describe("Why this transcreation choice — what the literal would have been and why it was rejected."),
      }),
    )
    .max(15)
    .describe(
      "Notable transcreation calls (idioms, cultural swaps, formality decisions). Empty array if everything was straightforward.",
    ),
});

export type LocalizerOutput = z.infer<typeof LocalizerOutputSchema>;

export interface LocalizerInput {
  voice?: VoiceCardForPrompt;
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  contextHint?: string;
  adapterNotes: CulturalAdapterOutput;
}

const SYSTEM = `You are a transcreation specialist — not a translator. Your job is to render copy into \
a target locale so that it lands the same way emotionally and rhetorically as the original, even when \
that requires changing literal words.

Quality bar:
- Honor the brand voice in the TARGET locale. If the voice card has locale-specific notes for the \
target, follow them. Otherwise apply the voice's universal rules.
- Use the cultural adapter's notes — they identified idioms, cultural references, formality choices, \
and length expectations. Don't ignore them; don't slavishly follow them either when your judgment \
disagrees, but justify any departures in 'decisions'.
- Match the formality recommendation precisely. If the adapter said "informal ty" for PL, do not \
slip into formal Pan/Pani. The wrong register kills the copy.
- Output PURE target copy — no preamble, no labels, no markdown fences.
- Translate well-known proper nouns natively where appropriate (brand names usually stay; product \
features sometimes localize).
- Length: lean into the adapter's expectation. PL/UA can run longer; don't pad to match EN, but \
don't compress so hard the rhythm breaks.

Locales: en (English), pl (Polish), ro (Romanian), uk (Ukrainian).

Output strictly conforms to the provided schema.`;

function buildPrompt(input: LocalizerInput): string {
  const lines: string[] = [];
  if (input.voice) {
    lines.push(renderVoiceCard(input.voice, input.targetLocale as "en" | "pl" | "ro" | "uk"));
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(`Source locale: ${input.sourceLocale}`);
  lines.push(`Target locale: ${input.targetLocale}`);
  if (input.contextHint) lines.push(`Context: ${input.contextHint}`);

  lines.push("\n# Transcreation guidance from cultural adapter");
  lines.push(`Formality: ${input.adapterNotes.formality_recommendation}`);
  lines.push(`Length expectation: ${input.adapterNotes.length_expectation}`);
  if (input.adapterNotes.notes.length > 0) {
    lines.push("\nSpecific items:");
    input.adapterNotes.notes.forEach((n, i) => {
      lines.push(`${i + 1}. [${n.category} · ${n.risk} risk]`);
      lines.push(`   "${n.excerpt}" — ${n.guidance}`);
    });
  } else {
    lines.push(
      "\nThe adapter found no cultural landmines — translate cleanly while preserving voice and rhetoric.",
    );
  }

  lines.push("\n---\n");
  lines.push("# Source text");
  lines.push(input.sourceText.trim());
  lines.push(
    `\nProduce the transcreation in ${input.targetLocale}. Output the target copy plus your notable transcreation decisions.`,
  );
  return lines.join("\n");
}

export const localizer = defineAgent<LocalizerInput, LocalizerOutput>({
  name: "localizer-transcreator",
  description: "Transcreates copy to the target locale, honoring brand voice and cultural adapter notes.",
  modelRole: "drafting",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: LocalizerOutputSchema,
  temperature: 0.6,
  maxTokens: 4000,
});
