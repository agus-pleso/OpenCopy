import "server-only";
import { z } from "zod";

import { defineAgent } from "./core";
import type { BrandProfile } from "@/db/schema";

/**
 * Brand-profile NL editor agent.
 *
 * For the Cmd+K command palette and the "edit profile in natural language"
 * surface. Takes a current BrandProfile + a user's NL command and returns a
 * structured JSON patch + a human-readable summary.
 *
 * Uses `generateObject` with a strict Zod schema (NOT markdown) because:
 *   - NL command interpretation needs the structured output to be machine-
 *     applicable; markdown-then-parse is too lossy here.
 *   - Markdown is reserved for chat-style turns where partial output is OK.
 *
 * The patch is then applied by `applyNlPatch` (sibling file) — a small
 * dot-path traversal helper with op = set | append | remove.
 */

export const NL_PATCH_OPS = ["set", "append", "remove"] as const;
export type NlPatchOp = (typeof NL_PATCH_OPS)[number];

export const NlPatchChangeSchema = z.object({
  field: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Dot-path into the BrandProfile JSON. Examples: 'voice.pl.formality', 'voice.pl.dos', 'positioning.differentiators', 'name', 'audiences.en'.",
    ),
  op: z
    .enum(["set", "append", "remove"])
    .describe(
      "How to apply the change. 'set' replaces the value, 'append' adds to an array (single item or many), 'remove' deletes a key OR an array element by value.",
    ),
  value: z
    .unknown()
    .describe(
      "The new value. For 'set': the full replacement. For 'append': either a single item or an array of items. For 'remove': either omitted (delete the field) or the value to remove from an array.",
    )
    .optional(),
});

export const NlCommandPatchSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(400)
    .describe(
      "One-sentence human-readable summary starting with 'I'll' or 'I understood:'. Read aloud to the marketer before applying.",
    ),
  changes: z
    .array(NlPatchChangeSchema)
    .max(20)
    .describe(
      "Ordered list of changes. Empty array if the command is ambiguous — the summary should explain why.",
    ),
});

export type NlPatchChange = z.infer<typeof NlPatchChangeSchema>;
export type NlCommandPatch = z.infer<typeof NlCommandPatchSchema>;

export interface BrandProfileEditorInput {
  profile: BrandProfile;
  command: string;
}

const SYSTEM = `You translate a marketer's natural-language edit command into a structured JSON patch over a brand profile.

The brand profile is the AI workspace's foundation — it carries the brand's voice (per-locale), knowledge, audiences (per-locale), positioning, and competitors. Marketers will type commands like:

  - "make the Polish voice more formal"
  - "add 'never use exclamation marks' to dos"
  - "remove 'curated' from forbidden words"
  - "the audience for English is small business owners not enterprise teams"
  - "change tagline to 'Coffee for people who notice'"
  - "add a competitor: Blue Bottle, hipster precision brand, https://bluebottlecoffee.com"

Your job is to:
  1. Identify which field(s) the command targets, using the BrandProfile dot-path notation.
  2. Decide the op: 'set' (replace), 'append' (push to array), or 'remove' (delete or pull from array).
  3. Produce the value in the EXACT shape the field expects:
       - voice.{locale}.formality is a number 1-10. "more formal" → set to a higher number.
       - voice.{locale}.toneDescriptors is string[].
       - voice.{locale}.dos / donts is { rule: string, why?: string }[].
       - voice.{locale}.requiredWords / forbiddenWords / vocabularyPreferences is string[].
       - audiences.{locale} is BrandProfileAudience[] with id/name/demographics/psychographics/painPoints[]/jobsToBeDone[]/decisionCriteria[].
       - positioning.differentiators / brandValues / standsFor / standsAgainst is string[].
       - competitors is BrandProfileCompetitor[] with id/name/url?/positioning?/whyTheyWin[]/whyWeWin[].
       - knowledge has offerings[], facts[], faqs[] in their respective object shapes.
       - name, tagline, mission are strings.
       - values is string[].
       - locales is string[] (subset of en/pl/ro/uk).
  4. Provide a one-sentence summary in first person ("I'll …" / "I'll …") that the marketer can confirm.

Important:
  - "make X more formal/casual": for voice formality, set to a number — formal=8, very formal=9-10, casual=3, very casual=1-2. If the current value is unknown, just set to the target number.
  - "add X to dos/donts": op='append', value is the rule string OR object {rule, why}.
  - "remove X from forbidden": op='remove', value is the string to pull.
  - If the command is ambiguous ("make it better"), return an empty changes array and explain in the summary.
  - If the command targets a locale that isn't in profile.locales, still emit the change — the host will validate.
  - Generate stable ids for new audience/competitor entries: kebab-case derived from name.

Output strictly conforms to the provided schema.`;

function summarizeProfileForPrompt(profile: BrandProfile): string {
  const lines: string[] = [];
  lines.push(`Name: ${profile.name || "(empty)"}`);
  if (profile.tagline) lines.push(`Tagline: ${profile.tagline}`);
  if (profile.values?.length) lines.push(`Values: ${profile.values.join(", ")}`);
  if (profile.locales?.length) lines.push(`Locales: ${profile.locales.join(", ")}`);
  const voiceLocales = Object.entries(profile.voice ?? {});
  for (const [loc, voice] of voiceLocales) {
    if (!voice) continue;
    lines.push(``);
    lines.push(`voice.${loc}:`);
    lines.push(`  toneDescriptors: ${voice.toneDescriptors?.join(", ") ?? "(empty)"}`);
    lines.push(`  voicePersona: ${voice.voicePersona ?? "(empty)"}`);
    lines.push(`  audience: ${voice.audience ?? "(empty)"}`);
    lines.push(`  readingLevel: ${voice.readingLevel ?? "(empty)"}`);
    lines.push(`  formality: ${voice.formality ?? "(unset)"}`);
    lines.push(`  emotionalRegister: ${voice.emotionalRegister ?? "(empty)"}`);
    lines.push(`  dos: ${voice.dos?.length ?? 0} rules`);
    lines.push(`  donts: ${voice.donts?.length ?? 0} rules`);
    lines.push(`  vocabularyPreferences: ${voice.vocabularyPreferences?.join(", ") ?? "(empty)"}`);
    lines.push(`  requiredWords: ${voice.requiredWords?.join(", ") ?? "(empty)"}`);
    lines.push(`  forbiddenWords: ${voice.forbiddenWords?.join(", ") ?? "(empty)"}`);
  }
  const audiences = profile.audiences ?? {};
  for (const [loc, list] of Object.entries(audiences)) {
    if (!list?.length) continue;
    lines.push(``);
    lines.push(`audiences.${loc}: ${list.map((a) => a.name).join(", ")}`);
  }
  if (profile.positioning) {
    lines.push(``);
    lines.push(`positioning:`);
    lines.push(`  differentiators: ${profile.positioning.differentiators?.join(", ") ?? "(empty)"}`);
    lines.push(`  brandValues: ${profile.positioning.brandValues?.join(", ") ?? "(empty)"}`);
    lines.push(`  standsFor: ${profile.positioning.standsFor?.join(", ") ?? "(empty)"}`);
    lines.push(`  standsAgainst: ${profile.positioning.standsAgainst?.join(", ") ?? "(empty)"}`);
  }
  if (profile.competitors?.length) {
    lines.push(``);
    lines.push(`competitors: ${profile.competitors.map((c) => c.name).join(", ")}`);
  }
  const k = profile.knowledge;
  if (k) {
    lines.push(``);
    lines.push(
      `knowledge: ${k.offerings?.length ?? 0} offerings, ${k.facts?.length ?? 0} facts, ${k.faqs?.length ?? 0} faqs`,
    );
  }
  return lines.join("\n");
}

function buildPrompt(input: BrandProfileEditorInput): string {
  const lines: string[] = [];
  lines.push("# Current brand profile");
  lines.push(summarizeProfileForPrompt(input.profile));
  lines.push("");
  lines.push("# Marketer's NL command");
  lines.push(input.command.trim());
  lines.push("");
  lines.push(
    "Produce the JSON patch (summary + changes array) following the schema. Be precise — fields are dot-pathed.",
  );
  return lines.join("\n");
}

export const brandProfileEditor = defineAgent<
  BrandProfileEditorInput,
  NlCommandPatch
>({
  name: "brand-profile-editor",
  description:
    "Translates a marketer's natural-language edit command into a structured JSON patch over the brand profile.",
  modelRole: "fast",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: NlCommandPatchSchema,
  temperature: 0.2,
  maxTokens: 2000,
});
