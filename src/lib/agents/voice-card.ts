import { z } from "zod";
import type { Locale } from "@/db/schema";

export type { Locale };

/**
 * Shared voice-card schema. Lives outside `server-only` modules so client
 * components can use the type / runtime checks if needed.
 *
 * The schema is the contract between:
 *  - the Voice Analyzer agent (writes one)
 *  - the brand_voices DB row (stores it)
 *  - every downstream agent (Voice Auditor, Copywriter, Localizer — all read it)
 */

export const VoiceCardRuleSchema = z.object({
  rule: z.string().min(1).max(400).describe("A short, declarative voice rule."),
  why: z.string().max(400).optional().describe(
    "One-sentence reason this rule exists. Strengthens auditor judgments.",
  ),
});

/**
 * Voice card schema. Constraint philosophy:
 *
 * Lower bounds are intentionally permissive (mostly `min(1)`) because some
 * providers route structured-output requests as plain JSON hints and the model
 * can return fewer items than the *target* range — especially for sparse
 * samples. We encode the *target* ranges in `.describe()` so the model still
 * aims high. Hard upper bounds prevent runaway output.
 */
export const VoiceCardSchema = z.object({
  tone_descriptors: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(12)
    .describe(
      "Aim for 3–8 short adjectives capturing the brand's tone (e.g. 'confident', 'warm', 'plainspoken'). Avoid generic words like 'professional'.",
    ),
  voice_persona: z
    .string()
    .min(1)
    .max(600)
    .describe(
      "1–3 sentences describing the implied speaker behind the copy. Include role, expertise, and posture.",
    ),
  audience: z
    .string()
    .min(1)
    .max(500)
    .describe("Who this copy is written for. Be specific about role, sophistication, and goals."),
  reading_level: z
    .string()
    .min(1)
    .max(60)
    .describe(
      "Reading level / grade band (e.g. '8th grade', 'professional', 'expert'). Match the samples.",
    ),
  dos: z
    .array(VoiceCardRuleSchema)
    .min(1)
    .max(12)
    .describe("Aim for 3–10 concrete, observable rules — what TO do."),
  donts: z
    .array(VoiceCardRuleSchema)
    .min(1)
    .max(12)
    .describe("Aim for 3–10 concrete, observable rules — what NOT to do."),
  required_words: z
    .array(z.string().min(1).max(60))
    .max(20)
    .describe(
      "Words / phrases the brand consistently uses (product names, signature terms). Empty array if none stand out.",
    ),
  forbidden_words: z
    .array(z.string().min(1).max(60))
    .max(20)
    .describe(
      "Words / phrases that violate the voice (jargon, banned competitor terms, AI tells like 'delve' or 'tapestry').",
    ),
  rationale: z
    .string()
    .min(1)
    .max(1200)
    .describe(
      "2–4 sentences explaining the voice characterization. Reference specific patterns observed in the samples.",
    ),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;

/** Subset of voice-card fields used at audit / generation time. */
export interface VoiceCardForPrompt {
  name: string;
  toneDescriptors: string[];
  voicePersona: string | null;
  audience: string | null;
  readingLevel: string | null;
  dos: { rule: string; why?: string | null }[];
  donts: { rule: string; why?: string | null }[];
  requiredWords: string[];
  forbiddenWords: string[];
  localeNotes: Partial<Record<Locale, string>>;
}

/** Renders a voice card as a stable string block for system prompts. */
export function renderVoiceCard(v: VoiceCardForPrompt, locale?: Locale): string {
  const lines: string[] = [];
  lines.push(`# Brand voice: ${v.name}`);
  if (v.voicePersona) lines.push(`Persona: ${v.voicePersona}`);
  if (v.audience) lines.push(`Audience: ${v.audience}`);
  if (v.readingLevel) lines.push(`Reading level: ${v.readingLevel}`);
  if (v.toneDescriptors.length) {
    lines.push(`Tone descriptors: ${v.toneDescriptors.join(", ")}`);
  }

  if (v.dos.length) {
    lines.push("\nDo:");
    v.dos.forEach((d, i) => {
      lines.push(
        `  ${i + 1}. ${d.rule}${d.why ? ` — ${d.why}` : ""}`,
      );
    });
  }
  if (v.donts.length) {
    lines.push("\nDon't:");
    v.donts.forEach((d, i) => {
      lines.push(
        `  ${i + 1}. ${d.rule}${d.why ? ` — ${d.why}` : ""}`,
      );
    });
  }
  if (v.requiredWords.length) {
    lines.push(`\nRequired vocabulary: ${v.requiredWords.join(", ")}`);
  }
  if (v.forbiddenWords.length) {
    lines.push(`\nForbidden vocabulary: ${v.forbiddenWords.join(", ")}`);
  }
  if (locale && v.localeNotes[locale]) {
    lines.push(`\nLocale-specific notes (${locale}): ${v.localeNotes[locale]}`);
  }
  return lines.join("\n");
}
