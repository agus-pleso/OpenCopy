import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";

export const DrafterOutputSchema = z.object({
  content: z
    .string()
    .min(5)
    .max(8000)
    .describe(
      "The actual copy. No preamble, no 'Here is your copy:', no markdown code fences. Just the copy.",
    ),
  rationale: z
    .string()
    .min(15)
    .max(400)
    .describe(
      "1–3 sentences explaining the most consequential choices made (the lead, the structural move, \
a specific word). Avoid restating the angle verbatim.",
    ),
});

export type DrafterOutput = z.infer<typeof DrafterOutputSchema>;

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
}

const SYSTEM = `You are a copywriter drafting one variant from a planned angle. \
Stay inside the brand voice and the angle's strategy.

Quality bar:
- Output PURE COPY — no preamble, no labels, no markdown code fences, no "Here's the copy". \
Whatever you output gets pasted directly into the marketing team's tool.
- Match the channel and length. An ad headline is not a paragraph. A landing-page hero is not a \
blog post.
- Honor every "Do" rule. Avoid every "Don't" rule. Use required vocabulary when natural; never use \
forbidden vocabulary.
- Don't be generic-AI. Avoid: "delve into", "tapestry of", "in today's fast-paced world", \
unmotivated triplets, em-dash addiction (unless the voice signals it), and "It's not just X — it's Y" \
clichés. The voice card overrides these defaults if it explicitly embraces them.
- Honor the angle's hook unless the brand voice contradicts it; in that case, find a hook in the \
spirit of the angle.

Rationale: 1-3 sentences naming the most consequential choices you made. No platitudes.

Output strictly conforms to the provided schema.`;

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
  if (input.audienceOverride) lines.push(`Audience override: ${input.audienceOverride}`);
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
  lines.push(
    "\nDraft the copy now. Output the copy itself plus a brief rationale. Match the channel + length. Stay in the voice.",
  );
  return lines.join("\n");
}

export const copywriterDrafter = defineAgent<DrafterInput, DrafterOutput>({
  name: "copywriter-drafter",
  description: "Drafts one copy variant from a chosen angle. Many of these run in parallel.",
  modelRole: "drafting",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: DrafterOutputSchema,
  temperature: 0.85,
  maxTokens: 3000,
});
