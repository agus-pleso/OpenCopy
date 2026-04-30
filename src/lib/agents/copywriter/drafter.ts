import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import {
  parseDrafterOutput,
  type DrafterOutput,
} from "./drafter-parser";

export { parseDrafterOutput, type DrafterOutput } from "./drafter-parser";

/**
 * Drafter.
 *
 * Earlier versions used `generateObject` with a `{ content, rationale }` Zod
 * schema. Smaller models would intermittently return objects with the
 * `content` field missing or wrap the copy in extra prose, blowing the run.
 *
 * Drafting is fundamentally a prose task — we now use `generateText` and ask
 * the model to write the copy followed by a `---` separator and a short
 * rationale. If the separator is missing (some models won't comply on
 * complex copy), the whole response becomes the copy and the rationale falls
 * back to a stock note. We never lose the actual copy.
 */

export interface DrafterInput {
  voice: VoiceCardForPrompt;
  channel: string;
  locale: string;
  objective: string;
  audienceOverride?: string;
  productInfo?: string;
  length?: string;
  keywords?: string[];
  forbiddenTerms?: string[];
  /** The chosen angle for this drafter. */
  angle: {
    label: string;
    strategy: string;
    hook: string;
    must_include?: string[];
    avoid?: string[];
  };
  /** Pre-formatted knowledge-base excerpts. */
  knowledge?: string;
}

const SYSTEM = `You are a copywriter drafting one variant from a planned angle. Stay inside the
brand voice and the angle's strategy.

Quality bar:
- The copy itself is PURE COPY — no preamble, no labels, no markdown code fences, no "Here's the
  copy". Whatever you put before the separator gets pasted directly into the marketing team's tool.
- Match the channel and length. An ad headline is not a paragraph. A landing-page hero is not a
  blog post.
- Honor every "Do" rule. Avoid every "Don't" rule. Use required vocabulary when natural; never
  use forbidden vocabulary.
- Don't be generic-AI. Avoid: "delve into", "tapestry of", "in today's fast-paced world",
  unmotivated triplets, em-dash addiction (unless the voice signals it), and "It's not just X —
  it's Y" clichés. The voice card overrides these defaults if it explicitly embraces them.
- Honor the angle's hook unless the brand voice contradicts it; in that case, find a hook in the
  spirit of the angle.

OUTPUT FORMAT — VERY IMPORTANT.
Output the copy first. Then a line containing exactly three dashes: ---
Then 1-3 sentences of rationale naming the most consequential choices you made.

Example shape:

Stop guessing what's blocking activation.

The clearest signal isn't a number — it's the support thread you've been ignoring.

Try Honeycomb free for 14 days.
---
Lead reframes "activation metric" as "support thread you've already seen", which the voice card
flags as the brand's signature move (samples 1 and 3). Closes with a pragmatic CTA, no triplet.`;

function buildPrompt(input: DrafterInput): string {
  const lines: string[] = [];
  lines.push(renderVoiceCard(input.voice));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# Brief");
  lines.push(`Channel: ${input.channel}`);
  lines.push(`Locale: ${input.locale}`);
  if (input.length) lines.push(`Length target: ${input.length}`);
  if (input.audienceOverride)
    lines.push(`Audience override: ${input.audienceOverride}`);
  lines.push(`\nObjective: ${input.objective.trim()}`);
  if (input.productInfo) {
    lines.push(`\nProduct / service: ${input.productInfo.trim()}`);
  }
  if (input.keywords?.length) {
    lines.push(`Keywords to weave in: ${input.keywords.join(", ")}`);
  }
  if (input.forbiddenTerms?.length) {
    lines.push(`Brief-specific forbidden terms: ${input.forbiddenTerms.join(", ")}`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`# Your angle: ${input.angle.label}`);
  lines.push(`Strategy: ${input.angle.strategy}`);
  lines.push(`Candidate hook: ${input.angle.hook}`);
  if (input.angle.must_include?.length) {
    lines.push(`Weave in: ${input.angle.must_include.join(", ")}`);
  }
  if (input.angle.avoid?.length) {
    lines.push(`Specifically avoid: ${input.angle.avoid.join(", ")}`);
  }

  if (input.knowledge?.trim()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(input.knowledge.trim());
    lines.push("");
    lines.push(
      "Use these excerpts as your source of factual specifics. Don't invent product features, pricing, or stats not present here.",
    );
  }

  lines.push(
    "\nDraft the copy now. Output the copy itself, then '---' on its own line, then a brief rationale.",
  );
  return lines.join("\n");
}

export interface DrafterRunResult {
  output: DrafterOutput;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export async function runCopywriterDrafter(
  input: DrafterInput,
  ctx: { workspaceId: string; userId: string },
): Promise<DrafterRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "drafting",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.85,
    maxTokens: 3000,
  });

  return {
    output: parseDrafterOutput(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
    },
  };
}
