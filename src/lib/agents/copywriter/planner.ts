import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import {
  parsePlannerMarkdown,
  type PlannerAngle,
  type PlannerOutput,
} from "./planner-parser";

export {
  parsePlannerMarkdown,
  type PlannerAngle,
  type PlannerOutput,
} from "./planner-parser";

export interface PlannerInput {
  voice: VoiceCardForPrompt;
  channel: string;
  locale: string;
  objective: string;
  audienceOverride?: string;
  productInfo?: string;
  length?: string;
  variantCount: number;
  keywords?: string[];
  forbiddenTerms?: string[];
  examples?: string;
  /** Pre-formatted knowledge-base excerpts. */
  knowledge?: string;
}

export interface PlannerRunResult {
  output: PlannerOutput;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a senior creative director planning a copywriting brief. Your job is to read
the brief and the brand voice, then produce N MEANINGFULLY different angles the drafters should
each take.

Quality bar:
- Each angle is genuinely different — different lead, different rhetorical move, different
  structural choice. "Variant A is shorter" is not an angle.
- Angle labels are evocative and specific ("Anti-jargon", "Specific-number", "Founder-confession") —
  not generic ("Direct", "Friendly").
- Strategy explains the WHY in a way a junior copywriter could follow.
- Hooks are candidate opening lines, not full drafts. They should feel like they could survive
  into the final copy.
- Respect the voice. If the brand voice forbids exclamation marks, don't suggest hooks with
  exclamation marks. If it requires a specific persona, every angle keeps that persona.
- Insight is grounded — name a real tension or constraint in this specific brief, not a platitude.

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN with the exact structure below. No code fences, no preamble.

## Insight
1-2 sentences naming what makes this brief tricky, interesting, or worth a particular angle.
Concrete, not generic.

## Angle 1: [evocative label]
**Strategy:** 1-3 sentences. The angle's premise and why it fits the brief and voice.
**Hook:** Candidate opening line.
**Must include:** comma-separated list (or "—" if none)
**Avoid:** comma-separated list (or "—" if none)

## Angle 2: [evocative label]
**Strategy:** ...
**Hook:** ...
**Must include:** ...
**Avoid:** ...

(Continue for as many angles as requested.)`;

function buildPrompt(input: PlannerInput): string {
  const lines: string[] = [];
  lines.push(renderVoiceCard(input.voice));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# Copywriting brief");
  lines.push(`Channel: ${input.channel}`);
  lines.push(`Locale: ${input.locale}`);
  if (input.length) lines.push(`Length: ${input.length}`);
  lines.push(`Variants requested: ${input.variantCount}`);
  if (input.audienceOverride) {
    lines.push(`Audience override: ${input.audienceOverride}`);
  }
  lines.push(`\nObjective:\n${input.objective.trim()}`);
  if (input.productInfo) {
    lines.push(`\nProduct / service:\n${input.productInfo.trim()}`);
  }
  if (input.keywords?.length) {
    lines.push(`\nKeywords to weave in: ${input.keywords.join(", ")}`);
  }
  if (input.forbiddenTerms?.length) {
    lines.push(`Brief-specific forbidden terms: ${input.forbiddenTerms.join(", ")}`);
  }
  if (input.examples?.trim()) {
    lines.push(`\nReference examples (style only, do not copy):\n${input.examples.trim()}`);
  }
  if (input.knowledge?.trim()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(input.knowledge.trim());
    lines.push("");
    lines.push(
      "Use the knowledge excerpts above as factual grounding. Each angle should be informed by what's in there — not by inventing product specifics.",
    );
  }
  lines.push(
    `\nProduce exactly ${input.variantCount} meaningfully different angles for the drafters. Use the markdown format described in the system prompt.`,
  );
  return lines.join("\n");
}

export async function runCopywriterPlanner(
  input: PlannerInput,
  ctx: { workspaceId: string; userId: string },
): Promise<PlannerRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "planning",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.7,
    maxTokens: 2500,
  });

  const parsed = parsePlannerMarkdown(result.text);

  // Defensive — guarantee at least one angle survives so the orchestrator can
  // proceed instead of throwing. If the model only produced one usable angle
  // when N were requested, drafters will run for what we have.
  const angles: PlannerAngle[] =
    parsed.angles.length > 0
      ? parsed.angles
      : [
          {
            label: "Default angle",
            strategy:
              "The planner couldn't produce structured angles. Drafter falls back to a single straightforward variant grounded in the brief.",
            hook: input.objective.split(/[.!?]/)[0] ?? input.objective,
            must_include: input.keywords ?? [],
            avoid: input.forbiddenTerms ?? [],
          },
        ];

  return {
    output: { insight: parsed.insight, angles },
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
    },
  };
}
