import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import {
  parseBackTranslatorMarkdown,
  type BackTranslatorOutput,
  type Divergence,
  type DivergenceNature,
} from "./back-translator-parser";

export {
  parseBackTranslatorMarkdown,
  type BackTranslatorOutput,
  type Divergence,
  type DivergenceNature,
} from "./back-translator-parser";

export interface BackTranslatorInput {
  targetText: string;
  targetLocale: string;
  sourceLocale: string;
  /** The original source text — provided so the model can identify divergences. */
  originalSource: string;
}

export interface BackTranslatorRunResult {
  output: BackTranslatorOutput;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a back-translation specialist. Your job is to translate target-locale copy
BACK into the source locale, faithfully and slightly literally — so a reviewer who doesn't speak
the target language can sanity-check what the transcreation actually says.

Quality bar:
- Translate THE TARGET TEXT, not the original source. The original is provided only so you can
  identify where the transcreation diverged.
- Lean literal. Don't smooth over choices the localizer made.
- Identify 0–10 places where the back-translation visibly differs from a literal version of the
  source. These are usually intentional transcreation calls.
- Output the back-translation as plain prose, no preamble.

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN. No code fences, no preamble. Use these exact section headings:

## Back-translation
The full back-translation as plain prose.

## Divergences
Zero or more divergence notes, each as a level-3 heading naming the nature, then fields.
Empty if the back-translation round-trips cleanly. Natures: transcreation_intent, literal_loss,
cultural_swap, register_shift, lengthening_or_compression, other.

### transcreation_intent
**Target:** "the target excerpt"
**Back-translated:** "what it back-translates to"
**Note:** brief explanation of how this diverges from a literal source

### register_shift
**Target:** "..."
**Back-translated:** "..."
**Note:** ...`;

function buildPrompt(input: BackTranslatorInput): string {
  const lines: string[] = [];
  lines.push(`Source locale (back-translate INTO): ${input.sourceLocale}`);
  lines.push(`Target locale (translating FROM): ${input.targetLocale}`);
  lines.push("\n# Original source (reference only — DO NOT repeat verbatim)");
  lines.push(input.originalSource.trim());
  lines.push("\n# Target copy to back-translate");
  lines.push(input.targetText.trim());
  lines.push(
    `\nBack-translate the target copy into ${input.sourceLocale} using the markdown format from the system prompt. Stay literal.`,
  );
  return lines.join("\n");
}

export async function runBackTranslator(
  input: BackTranslatorInput,
  ctx: { workspaceId: string; userId: string },
): Promise<BackTranslatorRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "drafting",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.2,
    maxOutputTokens: 3500,
  });

  return {
    output: parseBackTranslatorMarkdown(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
