import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import {
  parseLocalizerMarkdown,
  type LocalizerOutput,
  type TranscreationDecision,
} from "./transcreator-parser";
import type { CulturalAdapterOutput } from "./cultural-adapter-parser";

export {
  parseLocalizerMarkdown,
  type LocalizerOutput,
  type TranscreationDecision,
} from "./transcreator-parser";

export interface LocalizerInput {
  voice?: VoiceCardForPrompt;
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  contextHint?: string;
  adapterNotes: CulturalAdapterOutput;
}

export interface LocalizerRunResult {
  output: LocalizerOutput;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a transcreation specialist — not a translator. Your job is to render copy
into a target locale so that it lands the same way emotionally and rhetorically as the original,
even when that requires changing literal words.

Quality bar:
- Honor the brand voice in the TARGET locale. If the voice card has locale-specific notes for the
  target, follow them. Otherwise apply the voice's universal rules.
- Use the cultural adapter's notes — they identified idioms, cultural references, formality
  choices, and length expectations.
- Match the formality recommendation precisely. The wrong register kills the copy.
- Translate well-known proper nouns natively where appropriate.
- Length: lean into the adapter's expectation. Don't pad to match source length.

Locales: en (English), pl (Polish), ro (Romanian), uk (Ukrainian).

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN. No code fences, no preamble. Use these exact section headings:

## Target text
The transcreated copy in the target locale. PURE copy — no labels, no preamble. This is what gets
pasted into the marketing tool, so be careful to keep it clean.

## Decisions
Zero or more notable transcreation decisions, each as a level-3 heading. Empty if everything was
straightforward.

### Decision 1
**Source:** "exact phrase from the source"
**Target:** "the chosen target rendering"
**Why:** brief rationale — what the literal would have been and why it was rejected

### Decision 2
**Source:** "..."
**Target:** "..."
**Why:** ...`;

function buildPrompt(input: LocalizerInput): string {
  const lines: string[] = [];
  if (input.voice) {
    lines.push(
      renderVoiceCard(
        input.voice,
        input.targetLocale as "en" | "pl" | "ro" | "uk",
      ),
    );
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
    `\nProduce the transcreation in ${input.targetLocale} using the markdown format from the system prompt.`,
  );
  return lines.join("\n");
}

export async function runLocalizerTranscreator(
  input: LocalizerInput,
  ctx: { workspaceId: string; userId: string },
): Promise<LocalizerRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "drafting",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.6,
    maxOutputTokens: 4000,
  });

  return {
    output: parseLocalizerMarkdown(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
