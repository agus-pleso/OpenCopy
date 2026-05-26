import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { renderVoiceCard, type VoiceCardForPrompt } from "./voice-card";
import {
  parseVoiceAuditMarkdown,
  type VoiceAudit,
  type VoiceAuditIssue,
} from "./voice-audit-parser";

export {
  parseVoiceAuditMarkdown,
  type VoiceAudit,
  type VoiceAuditIssue,
} from "./voice-audit-parser";

export interface VoiceAuditorInput {
  voice: VoiceCardForPrompt;
  draft: string;
  /** Optional: which target locale should the auditor judge against. */
  locale?: "en" | "pl" | "ro" | "uk";
}

export interface VoiceAuditorRunResult {
  output: VoiceAudit;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a meticulous brand voice auditor. Your job is to read a draft of marketing
copy and judge how faithfully it matches a defined brand voice.

Standards:
- Score harshly but fairly. Generic AI-flavored prose ("delve into", "tapestry of", em-dash
  addiction without warrant, three-item triplets ad nauseam, "In today's fast-paced world…") is
  high-severity unless the voice explicitly embraces it.
- Excerpts MUST appear verbatim in the draft. If the draft says "delve into the tapestry", your
  excerpt is "delve into the tapestry" — do not paraphrase.
- Severity values: high (ship-blocker), medium (should fix), low (polish).
- Categories (use exactly one of these): tone, do_violation, dont_violation, forbidden_word,
  missing_required, reading_level, audience_mismatch, other.
- Suggestions, when given, preserve meaning and length. Do not rewrite the entire passage.
- Strengths must be specific. "Good word choice" is too vague.

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN with the structure below. No code fences, no preamble.

## Score
A number between 0 and 100. 90+ ships unchanged, 70-89 needs light edits, <70 needs rewrite.

## Summary
1-3 sentences summarising where the draft lands relative to the voice. Honest, not generic.

## Strengths
A markdown list of specific things the draft does well. Empty list if nothing stands out.
- ...
- ...

## Issues
For each issue, a level-3 heading carrying the severity and category, followed by the fields:

### high · dont_violation
**Excerpt:** "the exact text from the draft"
**Why:** explanation referencing the specific rule
**Fix:** proposed rewrite that preserves meaning

### medium · tone
**Excerpt:** "..."
**Why:** ...
**Fix:** ...

If the draft is fully on-brand, leave the Issues section empty (just the heading).`;

function buildPrompt(input: VoiceAuditorInput): string {
  const card = renderVoiceCard(input.voice, input.locale);
  const lines: string[] = [];
  lines.push(card);
  lines.push("\n---\n");
  lines.push(`Draft to audit${input.locale ? ` (locale=${input.locale})` : ""}:\n`);
  lines.push(input.draft.trim());
  lines.push(
    "\n\nReturn the audit using the markdown format described in the system prompt. Be concrete; ground every issue in specific text from the draft.",
  );
  return lines.join("\n");
}

export async function runVoiceAuditor(
  input: VoiceAuditorInput,
  ctx: { workspaceId: string; userId: string },
): Promise<VoiceAuditorRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "critic",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.3,
    maxOutputTokens: 4000,
  });

  return {
    output: parseVoiceAuditMarkdown(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
