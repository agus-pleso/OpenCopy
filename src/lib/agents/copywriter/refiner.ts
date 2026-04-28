import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import type { VoiceAuditIssue } from "../voice-auditor";

export const RefinerOutputSchema = z.object({
  refined_content: z
    .string()
    .min(5)
    .max(8000)
    .describe(
      "The refined copy. PURE copy — no preamble, no 'Here is the refined version:'. Same length and structure as the input unless an issue requires otherwise.",
    ),
  changes: z
    .array(
      z.object({
        from: z.string().min(1).max(400).describe("Original phrase, verbatim."),
        to: z.string().min(1).max(400).describe("Replacement phrase."),
        why: z.string().min(5).max(220).describe("Which audit issue this addresses."),
      }),
    )
    .max(20)
    .describe("Surgical edits made. Empty if nothing changed."),
});

export type RefinerOutput = z.infer<typeof RefinerOutputSchema>;

export interface RefinerInput {
  voice: VoiceCardForPrompt;
  draft: string;
  issues: VoiceAuditIssue[];
}

const SYSTEM = `You are a senior copy editor doing a refinement pass on a draft that just got audited. \
Your job is to address the auditor's issues with surgical edits while keeping everything else intact.

Quality bar:
- DO NOT rewrite the entire draft. Edit only what the issues call out.
- Each replacement preserves meaning, length, and rhythm where possible.
- Keep the voice. Use auditor suggestions when given; otherwise produce your own fix that respects \
the brand voice.
- If an issue's excerpt no longer makes sense after a prior edit, skip it — don't compound rewrites.
- Output PURE refined copy — no preamble, no markdown fences, no "Here is the refined version:".

Output strictly conforms to the provided schema.`;

function buildPrompt(input: RefinerInput): string {
  const lines: string[] = [];
  lines.push(renderVoiceCard(input.voice));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# Original draft");
  lines.push(input.draft.trim());
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# Audit issues to address");
  if (input.issues.length === 0) {
    lines.push("(no issues — return the draft unchanged with empty changes array)");
  } else {
    input.issues.forEach((issue, i) => {
      lines.push(`${i + 1}. [${issue.severity.toUpperCase()} · ${issue.category}]`);
      lines.push(`   Excerpt: "${issue.excerpt}"`);
      lines.push(`   Why it's flagged: ${issue.explanation}`);
      if (issue.suggestion) {
        lines.push(`   Auditor's suggestion: ${issue.suggestion}`);
      }
      lines.push("");
    });
  }
  lines.push(
    "Refine the draft. Make only the edits needed to clear these issues. Preserve structure, length, and rhythm. Output the full refined copy plus a list of changes.",
  );
  return lines.join("\n");
}

export const copywriterRefiner = defineAgent<RefinerInput, RefinerOutput>({
  name: "copywriter-refiner",
  description: "Surgically rewrites only the lines flagged by the Voice Auditor.",
  modelRole: "drafting",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: RefinerOutputSchema,
  temperature: 0.5,
  maxTokens: 3000,
});
