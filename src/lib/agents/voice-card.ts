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

/**
 * Maximum string lengths (characters) for voice-card fields.
 *
 * Shared by the three layers that must agree on them:
 *  - `VoiceCardSchema` below — the agent-output contract;
 *  - `parseVoiceCardMarkdown` — clamps model output to these bounds;
 *  - `UpdateCardSchema` in `server/actions/voices.ts` — the save-time gate.
 *
 * They must be defined once: when the parser accepts a longer string than the
 * save schema allows, an extracted card can clear the review UI and then throw
 * a ZodError on save. These bounds are the loosest of the historical per-layer
 * limits, so tightening one here can reject a card a user already saved — only
 * ever loosen.
 */
export const VOICE_CARD_LIMITS = {
  /** Tone descriptors + required/forbidden vocabulary — short word-like items. */
  word: 60,
  voicePersona: 800,
  audience: 600,
  readingLevel: 60,
  rule: 400,
  ruleWhy: 400,
  signaturePhrase: 200,
  rationale: 1500,
} as const;

export const VoiceCardRuleSchema = z.object({
  rule: z
    .string()
    .min(1)
    .max(VOICE_CARD_LIMITS.rule)
    .describe("A short, declarative voice rule."),
  why: z.string().max(VOICE_CARD_LIMITS.ruleWhy).optional().describe(
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
    .array(z.string().min(1).max(VOICE_CARD_LIMITS.word))
    .min(1)
    .max(12)
    .describe(
      "Aim for 3–8 short adjectives capturing the brand's tone (e.g. 'confident', 'warm', 'plainspoken'). Avoid generic words like 'professional'.",
    ),
  voice_persona: z
    .string()
    .min(1)
    .max(VOICE_CARD_LIMITS.voicePersona)
    .describe(
      "1–3 sentences describing the implied speaker behind the copy. Include role, expertise, and posture.",
    ),
  audience: z
    .string()
    .min(1)
    .max(VOICE_CARD_LIMITS.audience)
    .describe("Who this copy is written for. Be specific about role, sophistication, and goals."),
  reading_level: z
    .string()
    .min(1)
    .max(VOICE_CARD_LIMITS.readingLevel)
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
    .array(z.string().min(1).max(VOICE_CARD_LIMITS.word))
    .max(20)
    .describe(
      "Words / phrases the brand consistently uses (product names, signature terms). Empty array if none stand out.",
    ),
  forbidden_words: z
    .array(z.string().min(1).max(VOICE_CARD_LIMITS.word))
    .max(20)
    .describe(
      "Words / phrases that violate the voice (jargon, banned competitor terms, AI tells like 'delve' or 'tapestry').",
    ),
  signature_phrases: z
    .object({
      en: z.array(z.string().min(1).max(VOICE_CARD_LIMITS.signaturePhrase)).max(30).default([]),
      pl: z.array(z.string().min(1).max(VOICE_CARD_LIMITS.signaturePhrase)).max(30).default([]),
      ro: z.array(z.string().min(1).max(VOICE_CARD_LIMITS.signaturePhrase)).max(30).default([]),
      uk: z.array(z.string().min(1).max(VOICE_CARD_LIMITS.signaturePhrase)).max(30).default([]),
    })
    .default({ en: [], pl: [], ro: [], uk: [] })
    .describe(
      "Locale-tagged signature phrases — full sentences or canonical expressions the brand uses. Distinct from required_words (single tokens). E.g. for a therapy brand: en=['Take a moment to notice', 'Small steps matter'], pl=['Pozwól sobie zauważyć', 'Małe kroki mają znaczenie']. Empty arrays if none for a given locale.",
    ),
  rationale: z
    .string()
    .min(1)
    .max(VOICE_CARD_LIMITS.rationale)
    .describe(
      "2–4 sentences explaining the voice characterization. Reference specific patterns observed in the samples.",
    ),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;

export type VoiceCardSignaturePhrases = Record<Locale, string[]>;

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
  /** Locale-tagged canonical phrases. Optional so existing call sites that
   * pre-date this field continue to type-check; renderVoiceCard treats a
   * missing value the same as `{}`. New call sites should pass `voice.signaturePhrases`. */
  signaturePhrases?: Partial<VoiceCardSignaturePhrases>;
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
  // Signature phrases are full canonical expressions, locale-tagged. Render the
  // ones for the current target locale (the writer is in that locale's mode);
  // if no specific locale given, render all so the auditor can see cross-locale
  // consistency expectations.
  const phraseLocales: Locale[] = locale ? [locale] : (["en", "pl", "ro", "uk"] as const);
  const phraseLines: string[] = [];
  for (const lc of phraseLocales) {
    const phrases = v.signaturePhrases?.[lc];
    if (phrases && phrases.length) {
      phraseLines.push(`  ${lc.toUpperCase()}: ${phrases.map((p) => `"${p}"`).join(" · ")}`);
    }
  }
  if (phraseLines.length) {
    lines.push("\nSignature phrases (use these verbatim where they fit naturally):");
    lines.push(...phraseLines);
  }
  if (locale && v.localeNotes[locale]) {
    lines.push(`\nLocale-specific notes (${locale}): ${v.localeNotes[locale]}`);
  }
  return lines.join("\n");
}
