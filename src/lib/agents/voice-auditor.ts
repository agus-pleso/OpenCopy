import "server-only";
import { z } from "zod";
import { defineAgent, formatRuleList, formatList } from "./core";
import { renderVoiceCard, type VoiceCardForPrompt } from "./voice-card";

export const VoiceAuditIssueSchema = z.object({
  excerpt: z
    .string()
    .min(1)
    .max(400)
    .describe(
      "The exact text from the draft that triggered the issue. Verbatim — must appear in the draft.",
    ),
  category: z
    .enum([
      "tone",
      "do_violation",
      "dont_violation",
      "forbidden_word",
      "missing_required",
      "reading_level",
      "audience_mismatch",
      "other",
    ])
    .describe("Which kind of voice rule was breached."),
  severity: z.enum(["low", "medium", "high"]).describe(
    "high = ship-blocker; medium = should fix; low = polish.",
  ),
  explanation: z
    .string()
    .min(10)
    .max(400)
    .describe("Why this excerpt violates the voice. Reference the specific rule."),
  suggestion: z
    .string()
    .min(1)
    .max(400)
    .optional()
    .describe("Proposed rewrite that fixes the issue while preserving meaning."),
});

export const VoiceAuditSchema = z.object({
  overall_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "0-100 voice fidelity. 90+ = ships unchanged. 70-89 = light edits. <70 = needs rewrite.",
    ),
  summary: z
    .string()
    .min(15)
    .max(400)
    .describe(
      "1-3 sentences summarizing where the draft lands relative to the voice. Honest, not generic.",
    ),
  strengths: z
    .array(z.string().min(5).max(220))
    .max(5)
    .describe(
      "Up to 5 things the draft does well, grounded in specific phrases. Empty array if nothing stands out.",
    ),
  issues: z
    .array(VoiceAuditIssueSchema)
    .max(20)
    .describe(
      "Issues sorted by severity (high first). Empty array if the draft is on-brand.",
    ),
});

export type VoiceAudit = z.infer<typeof VoiceAuditSchema>;
export type VoiceAuditIssue = z.infer<typeof VoiceAuditIssueSchema>;

export interface VoiceAuditorInput {
  voice: VoiceCardForPrompt;
  draft: string;
  /** Optional: which target locale should the auditor judge against. */
  locale?: "en" | "pl" | "ro" | "uk";
}

const SYSTEM = `You are a meticulous brand voice auditor. Your job is to read a draft of marketing copy \
and judge how faithfully it matches a defined brand voice.

Standards:
- Score harshly but fairly. Generic AI-flavored prose ("delve into", "tapestry of", em-dash addiction \
without warrant, three-item triplets ad nauseam, 'In today's fast-paced world…') is high-severity \
unless the voice explicitly embraces it.
- Excerpts MUST appear verbatim in the draft. If the user's draft says "delve into the tapestry", \
your excerpt is "delve into the tapestry" — do not paraphrase.
- "do_violation" = the draft fails one of the brand's Do rules. "dont_violation" = the draft does \
something the brand explicitly forbids.
- Suggestions, when given, preserve meaning and length. Do not rewrite the entire passage.
- Strengths must be specific. "Good word choice" is too vague. "Uses 'craft' over 'make' — fits the \
artisan persona" is good.

Output strictly conforms to the provided schema.`;

function buildPrompt(input: VoiceAuditorInput): string {
  const card = renderVoiceCard(input.voice, input.locale);
  const lines: string[] = [];
  lines.push(card);
  lines.push("\n---\n");
  lines.push(`Draft to audit${input.locale ? ` (locale=${input.locale})` : ""}:\n`);
  lines.push(input.draft.trim());
  lines.push(
    "\n\nReturn the structured audit. Be concrete, ground every issue in specific text from the draft, and resist generic feedback.",
  );
  return lines.join("\n");
}

// (We import these formatters even if unused in this file so other agents can rely
// on the same surface. Keeps tree-shaking honest.)
void formatRuleList;
void formatList;

export const voiceAuditor = defineAgent<VoiceAuditorInput, VoiceAudit>({
  name: "voice-auditor",
  description: "Scores a draft against a brand voice and surfaces line-level issues.",
  modelRole: "critic",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: VoiceAuditSchema,
  temperature: 0.3,
  maxTokens: 4000,
});
