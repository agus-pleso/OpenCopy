import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import type { ChannelComponent } from "@/db/schema";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import {
  parseDrafterOutput,
  parseMultiComponentDrafterOutput,
  type DrafterOutput,
} from "./drafter-parser";

export {
  parseDrafterOutput,
  parseMultiComponentDrafterOutput,
  type DrafterOutput,
} from "./drafter-parser";

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
  /**
   * Pre-formatted reference exemplars from the team's manual library
   * (V2.4). Distinct from `knowledge` — exemplars are STYLE references,
   * knowledge is FACTUAL grounding. Both injected into the prompt; both
   * optional. Format produced by `formatExemplarsForPrompt`.
   */
  exemplars?: string;
  /**
   * V2.4 — when set, the drafter is asked for ONE labeled section per
   * component instead of free-form copy. Used by the campaign flow with
   * a `channel_definition`. The DrafterOutput returns a `components`
   * keyed-by-id map. Copywriter (single-shot) leaves this undefined.
   */
  components?: ChannelComponent[];
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

  if (input.exemplars?.trim()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(input.exemplars.trim());
    lines.push("");
    lines.push(
      "Read the exemplars above as STYLE / TONE references. Match the cadence, sentence shape, and on-brand feel — do NOT copy phrasing, facts, or specifics from them.",
    );
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

  if (input.components && input.components.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("# Required output components");
    lines.push(
      "This channel has a structured component schema. Output ONE labeled markdown section per component, in the order listed below. Use a level-1 heading (`# <id>`) with the EXACT id (no spaces, no hyphens). After all sections, write `---` on its own line, then a brief rationale.",
    );
    lines.push("");
    for (const c of input.components) {
      const constraints: string[] = [];
      constraints.push(c.required ? "required" : "optional");
      constraints.push(`type: ${c.type}`);
      if (c.maxLength) constraints.push(`max ${c.maxLength} chars`);
      lines.push(`- \`${c.id}\` (${c.label}) — ${constraints.join(", ")}.`);
      if (c.hint) lines.push(`    Hint: ${c.hint}`);
      if (c.prompt) lines.push(`    Per-component instruction: ${c.prompt}`);
    }
    lines.push("");
    lines.push("Example shape (illustrative — match your channel's actual ids):");
    lines.push("```");
    lines.push("# subject");
    lines.push("Stop guessing what's blocking activation");
    lines.push("");
    lines.push("# body");
    lines.push("Multi-paragraph body…");
    lines.push("");
    lines.push("# cta");
    lines.push("Read the playbook");
    lines.push("");
    lines.push("---");
    lines.push("Lead reframes the activation metric…");
    lines.push("```");
  } else {
    lines.push(
      "\nDraft the copy now. Output the copy itself, then '---' on its own line, then a brief rationale.",
    );
  }
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
    maxOutputTokens: 3000,
  });

  // Multi-component flow uses a different parser that maps named sections
  // back to component ids. Single-shot legacy flow uses the existing parser.
  const output =
    input.components && input.components.length > 0
      ? parseMultiComponentDrafterOutput(
          result.text,
          input.components.map((c) => c.id),
        )
      : parseDrafterOutput(result.text);

  return {
    output,
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
