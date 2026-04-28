import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";

export const BackTranslatorOutputSchema = z.object({
  back_translation: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "Faithful, literal-leaning translation of the target copy back into the source locale. PURE text.",
    ),
  divergences: z
    .array(
      z.object({
        target_excerpt: z.string().min(1).max(400),
        back_translated: z.string().min(1).max(400),
        nature: z.enum([
          "transcreation_intent",
          "literal_loss",
          "cultural_swap",
          "register_shift",
          "lengthening_or_compression",
          "other",
        ]),
        note: z.string().min(5).max(300).describe(
          "Brief explanation of how the back-translation diverges from a hypothetical literal source.",
        ),
      }),
    )
    .max(10)
    .describe(
      "Up to 10 places where the back-translation visibly differs from a literal source — usually intentional transcreation choices. Empty if it round-trips cleanly.",
    ),
});

export type BackTranslatorOutput = z.infer<typeof BackTranslatorOutputSchema>;

export interface BackTranslatorInput {
  targetText: string;
  targetLocale: string;
  sourceLocale: string;
  /** The original source text is passed for divergence comparison only — the
   *  back-translation must be derived from the target text, not by repeating
   *  the source. */
  originalSource: string;
}

const SYSTEM = `You are a back-translation specialist. Your job is to translate target-locale copy \
BACK into the source locale, faithfully and slightly literally — so a reviewer who doesn't speak the \
target language can sanity-check what the transcreation actually says.

Quality bar:
- Translate THE TARGET TEXT, not the original source. The original is provided only so you can \
identify where the transcreation diverged.
- Lean literal. Don't smooth over choices the localizer made — that's the auditor's job, not yours.
- Identify 0–10 places where the back-translation visibly differs from a literal version of the \
source. These are usually intentional transcreation calls and that's fine; we just want to surface \
them for the reviewer.
- Output the back-translation as plain prose, no preamble.

Output strictly conforms to the provided schema.`;

function buildPrompt(input: BackTranslatorInput): string {
  const lines: string[] = [];
  lines.push(`Source locale (back-translate INTO): ${input.sourceLocale}`);
  lines.push(`Target locale (translating FROM): ${input.targetLocale}`);
  lines.push("\n# Original source (reference only — DO NOT repeat verbatim)");
  lines.push(input.originalSource.trim());
  lines.push("\n# Target copy to back-translate");
  lines.push(input.targetText.trim());
  lines.push(
    `\nBack-translate the target copy into ${input.sourceLocale}. Stay literal. Note up to 10 divergences from the original source.`,
  );
  return lines.join("\n");
}

export const backTranslator = defineAgent<BackTranslatorInput, BackTranslatorOutput>({
  name: "localizer-back-translator",
  description: "Faithful literal back-translation for sanity-checking transcreation.",
  modelRole: "drafting",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: BackTranslatorOutputSchema,
  temperature: 0.2,
  maxTokens: 3500,
});
