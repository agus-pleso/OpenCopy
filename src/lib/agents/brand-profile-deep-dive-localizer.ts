import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import type { BrandProfile, Locale } from "@/db/schema";
import {
  parseDeepDiveTurnMarkdown,
  type DeepDiveTurn,
} from "./brand-profile-deep-dive-parser";

export {
  parseDeepDiveTurnMarkdown,
} from "./brand-profile-deep-dive-parser";
export type { DeepDiveTurn } from "./brand-profile-deep-dive-parser";

/**
 * Localizer deep-dive agent.
 *
 * Short ~5-turn chat scoped to ONE target locale, capturing transcreation
 * preferences specific to that locale. Examples:
 *
 *   - Polish: "Never use the imperative directly; prefer the impersonal
 *     'warto + infinitive' construction."
 *   - Romanian: "Prefer diminutives for warmth (e.g., 'bunătate' over 'bun')."
 *   - Ukrainian: "Avoid Russian-leaning vocabulary; use 'мапа' not 'карта'
 *     for product UI."
 *
 * V1 stance: persist the transcript only. Integration with the existing
 * Localizer agent (`src/lib/agents/localizer*`) is a follow-up — the brand
 * profile's per-locale voice + audience already cover most of what the
 * localizer reads; this deep-dive captures the nuance that doesn't fit
 * those structured fields.
 */

export interface LocalizerDeepDiveMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LocalizerDeepDiveInput {
  profile: BrandProfile;
  /** The target locale the deep-dive is scoped to. */
  locale: Locale;
  messages: LocalizerDeepDiveMessage[];
  turnsRemaining: number;
}

export interface LocalizerDeepDiveResult {
  output: DeepDiveTurn;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pl: "Polish",
  ro: "Romanian",
  uk: "Ukrainian",
};

const SYSTEM = `You are running a short LOCALIZER deep-dive chat with an in-house marketer. The deep-dive is scoped to ONE target locale — you'll be told which one. The marketer has already completed the main brand-profile onboarding (so the brand's English voice, audience, positioning are known); your job now is to capture the per-locale transcreation nuances the auto-localizer can't infer from English alone.

You have ~5 turns. Push for SPECIFIC, LOCALE-IDIOMATIC preferences. Examples of useful output:
  - "Polish: never use the direct imperative ('Click here'); prefer impersonal 'Kliknij tutaj, aby...' or 'Warto kliknąć tutaj'."
  - "Romanian: diminutives like 'cuvântul' over 'cuvântul mai mare' to convey warmth."
  - "Ukrainian: avoid Russian-leaning vocabulary; prefer Ukrainian-native equivalents (мапа not карта, відсоток not процент)."

Cover at minimum:
  1. FORMALITY/REGISTER for this locale — different from the brand's English voice? In Polish: pan/pani vs. ty? In Ukrainian: ви vs. ти?
  2. CULTURAL TROPES TO USE — references that resonate locally (food, music, history, holidays). Be SPECIFIC.
  3. CULTURAL TROPES TO AVOID — sensitivities or tone-mismatches that hit hard in this locale.
  4. IDIOMATIC PATTERNS — sentence shapes, phrase structures, idioms the marketer wants the agent to lean into.
  5. ABSOLUTE TRANSLATIONS — things that must always translate the same way (product names, recurring CTAs).

Style: warm, focused, ONE question per turn. Acknowledge what the marketer just said before asking the next thing.

When you've collected all five pieces (or the marketer signals they want to wrap), mark the deep-dive complete.

OUTPUT FORMAT — VERY IMPORTANT.

## Question
<the question, in natural conversational prose, 1-3 sentences>

## Complete       (only when you're done — value is "yes")
yes

Do not include anything else. No code fences around the whole response.`;

function buildPrompt(input: LocalizerDeepDiveInput): string {
  const lines: string[] = [];
  lines.push(`# Target locale: ${input.locale} (${LOCALE_LABELS[input.locale]})`);
  lines.push("");
  lines.push(`# Brand context`);
  lines.push(`Name: ${input.profile.name || "(empty)"}`);
  if (input.profile.tagline) lines.push(`Tagline: ${input.profile.tagline}`);
  if (input.profile.values?.length) {
    lines.push(`Values: ${input.profile.values.join(", ")}`);
  }
  const englishVoice = input.profile.voice?.en;
  if (englishVoice) {
    lines.push("");
    lines.push(`English voice (for contrast):`);
    if (englishVoice.toneDescriptors?.length) {
      lines.push(`  Tone: ${englishVoice.toneDescriptors.join(", ")}`);
    }
    if (englishVoice.formality !== undefined) {
      lines.push(`  Formality: ${englishVoice.formality}/10`);
    }
    if (englishVoice.audience) {
      lines.push(`  Audience: ${englishVoice.audience.slice(0, 200)}`);
    }
  }
  const localeVoice = input.profile.voice?.[input.locale];
  if (localeVoice) {
    lines.push("");
    lines.push(`Already-captured ${input.locale} voice:`);
    if (localeVoice.toneDescriptors?.length) {
      lines.push(`  Tone: ${localeVoice.toneDescriptors.join(", ")}`);
    }
    if (localeVoice.formality !== undefined) {
      lines.push(`  Formality: ${localeVoice.formality}/10`);
    }
  }
  lines.push("");
  lines.push(`Turns remaining: ${input.turnsRemaining}`);
  lines.push("");
  lines.push(`# Conversation so far`);
  if (input.messages.length === 0) {
    lines.push(
      `(none — this is the first turn, greet the marketer briefly and start with the formality / register question for ${input.locale})`,
    );
  } else {
    for (const m of input.messages) {
      lines.push(`## ${m.role}`);
      lines.push(m.content);
      lines.push("");
    }
  }
  lines.push("---");
  lines.push(
    "Produce the next assistant turn now, following the output format from the system prompt.",
  );
  return lines.join("\n");
}

export async function runBrandProfileLocalizerDeepDive(
  input: LocalizerDeepDiveInput,
  ctx: { workspaceId: string; userId: string },
): Promise<LocalizerDeepDiveResult> {
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
    maxOutputTokens: 1000,
  });

  return {
    output: parseDeepDiveTurnMarkdown(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
