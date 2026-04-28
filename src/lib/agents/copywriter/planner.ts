import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";

export const PlannerOutputSchema = z.object({
  insight: z
    .string()
    .min(15)
    .max(400)
    .describe(
      "1–2 sentences naming what makes this brief tricky, interesting, or worth a particular angle. Concrete, not generic.",
    ),
  angles: z
    .array(
      z.object({
        label: z
          .string()
          .min(2)
          .max(60)
          .describe(
            "Short, evocative angle name (e.g. 'Problem-first', 'Anti-jargon', 'Specific-number'). Not 'Variant 1'.",
          ),
        strategy: z
          .string()
          .min(20)
          .max(400)
          .describe("1–3 sentences. The angle's premise and why it fits the brief + voice."),
        hook: z
          .string()
          .min(5)
          .max(220)
          .describe("Candidate opening line or hook the drafter should consider."),
        must_include: z
          .array(z.string())
          .max(6)
          .describe(
            "Concrete things the drafter should weave in. Empty array if none.",
          ),
        avoid: z
          .array(z.string())
          .max(6)
          .describe(
            "Specific traps for THIS angle (in addition to brand-level don'ts). Empty array if none.",
          ),
      }),
    )
    .min(1)
    .max(5)
    .describe("One angle per requested variant. Each angle must be MEANINGFULLY different from the others."),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

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
  /** Pre-formatted knowledge-base excerpts (output of formatKnowledgeForPrompt). */
  knowledge?: string;
}

const SYSTEM = `You are a senior creative director planning a copywriting brief. \
Your job is to read the brief and the brand voice, then produce N MEANINGFULLY different angles \
the drafters should each take.

Quality bar:
- Each angle is genuinely different — different lead, different rhetorical move, different structural \
choice. "Variant A is shorter" is not an angle.
- Angle labels are evocative and specific ("Anti-jargon", "Specific-number", "Founder-confession") — \
not generic ("Direct", "Friendly").
- Strategy explains the WHY in a way a junior copywriter could follow.
- Hooks are candidate opening lines, not full drafts. They should feel like they could survive into \
the final copy.
- Respect the voice. If the brand voice forbids exclamation marks, don't suggest hooks with \
exclamation marks. If it requires a specific persona, every angle keeps that persona.
- Insight is grounded — name a real tension or constraint in this specific brief, not a platitude.

Output strictly conforms to the provided schema.`;

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
    `\nProduce exactly ${input.variantCount} meaningfully different angles for the drafters.`,
  );
  return lines.join("\n");
}

export const copywriterPlanner = defineAgent<PlannerInput, PlannerOutput>({
  name: "copywriter-planner",
  description: "Produces a set of meaningfully different angles for parallel drafters to pursue.",
  modelRole: "planning",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: PlannerOutputSchema,
  temperature: 0.7,
  maxTokens: 2500,
});
