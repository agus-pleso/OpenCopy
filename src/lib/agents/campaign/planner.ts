import "server-only";
import { z } from "zod";
import { defineAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";

const ChannelEnum = z.enum([
  "ad",
  "email",
  "landing",
  "social",
  "blog",
  "headline",
  "product_description",
  "other",
]);

export const CampaignPlannerOutputSchema = z.object({
  strategy: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "1–3 sentences naming the unifying campaign strategy — the through-line every asset will share.",
    ),
  hook: z
    .string()
    .min(5)
    .max(220)
    .describe(
      "The campaign-level hook or theme. A single phrase / promise / framing the assets will all rhyme with.",
    ),
  assets: z
    .array(
      z.object({
        channel: ChannelEnum.describe(
          "Channel for this asset. Must be one of the channels the user requested.",
        ),
        label: z
          .string()
          .min(2)
          .max(80)
          .describe(
            "Descriptive name for THIS asset (e.g. 'Launch hero — problem-led', 'LinkedIn carousel — founder voice', 'Ad — specific number'). Not 'Asset 1'.",
          ),
        angle: z
          .string()
          .min(20)
          .max(400)
          .describe(
            "1–3 sentences. How THIS asset differentiates from the others while staying in the campaign's strategy.",
          ),
        length_hint: z
          .string()
          .min(2)
          .max(80)
          .describe("Concrete length target (e.g. '120 words', '2 lines', 'subject + 80 word body')."),
      }),
    )
    .min(1)
    .max(12)
    .describe(
      "The full asset list. Quantity per channel is YOUR call — match the campaign's needs (e.g. 1 blog, 3 social posts, 2 ads, 1 email body+subject = 7 assets). Don't overfill.",
    ),
});

export type CampaignPlannerOutput = z.infer<typeof CampaignPlannerOutputSchema>;

export interface CampaignPlannerInput {
  voice?: VoiceCardForPrompt;
  name: string;
  objective: string;
  audienceOverride?: string;
  productInfo?: string;
  locale: string;
  requestedChannels: Array<z.infer<typeof ChannelEnum>>;
  /** Pre-formatted KB excerpts. */
  knowledge?: string;
}

const SYSTEM = `You are a campaign strategist deciding what assets a marketing team should ship for a \
launch / push / moment. The user has named the goal and the channels. Your job is to (1) define the \
campaign's unifying strategy + hook, and (2) decide the exact asset list — each asset purposeful and \
distinctively angled.

Quality bar:
- Decide quantity yourself per channel — typical: 1 blog intro, 2-4 social posts, 1-3 ads, 1 email \
(subject + body counts as ONE asset), 1 landing hero. Total 4-10 assets unless the brief screams for \
more. Don't pad.
- Each asset's angle is differentiated. If two social posts have indistinguishable angles, drop one.
- Channels in your output must come from the user's requested channels. Never invent a channel.
- Length hints are concrete. "Short" is not a length hint. "≤ 80 chars" or "120 words" is.
- The hook is the campaign's spine — every asset should rhyme with it. Make it specific and \
actionable, not generic ("Innovation that delivers" is a bad hook; "Six hours back, every Friday" is \
a good one).
- If a brand voice is supplied, every angle and the hook itself must respect it — same tone, same \
do's and don'ts.

Output strictly conforms to the provided schema.`;

function buildPrompt(input: CampaignPlannerInput): string {
  const lines: string[] = [];
  if (input.voice) {
    lines.push(renderVoiceCard(input.voice));
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(`# Campaign: ${input.name}`);
  lines.push(`Locale: ${input.locale}`);
  lines.push(`Requested channels: ${input.requestedChannels.join(", ")}`);
  if (input.audienceOverride) {
    lines.push(`Audience override: ${input.audienceOverride}`);
  }
  lines.push(`\nObjective:\n${input.objective.trim()}`);
  if (input.productInfo) {
    lines.push(`\nProduct / service:\n${input.productInfo.trim()}`);
  }
  if (input.knowledge?.trim()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(input.knowledge.trim());
    lines.push(
      "\nUse the knowledge excerpts as factual grounding when shaping the strategy + hook.",
    );
  }
  lines.push(
    "\nProduce the campaign plan now. Return strategy, hook, and the full asset list with channel + label + angle + length_hint per asset.",
  );
  return lines.join("\n");
}

export const campaignPlanner = defineAgent<CampaignPlannerInput, CampaignPlannerOutput>({
  name: "campaign-planner",
  description:
    "Reads a campaign brief and decides the unified strategy + the exact asset list to draft.",
  modelRole: "planning",
  systemPrompt: SYSTEM,
  buildPrompt,
  outputSchema: CampaignPlannerOutputSchema,
  temperature: 0.6,
  maxTokens: 3000,
});
