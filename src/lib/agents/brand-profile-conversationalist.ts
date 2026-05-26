import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import type { BrandProfile } from "@/db/schema";
import {
  parseConversationalistTurnMarkdown,
  type ConversationalistAxis,
  type ConversationalistTurn,
} from "./brand-profile-conversationalist-parser";

export {
  parseConversationalistTurnMarkdown,
  CONVERSATIONALIST_AXES,
} from "./brand-profile-conversationalist-parser";
export type {
  ConversationalistAxis,
  ConversationalistTurn,
} from "./brand-profile-conversationalist-parser";

/**
 * Brand-profile conversationalist agent.
 *
 * Drives the 15-25-turn onboarding chat that captures all four axes
 * (voice / knowledge / audience / positioning) plus structured competitors
 * and an optional sample-paste step. Stays in markdown-output land — the
 * model emits a single `## Question` section per turn plus an optional
 * `## Captured` patch when consolidating an axis.
 *
 * Pacing strategy (fixed-but-smart):
 *   - voice ~5 turns, knowledge ~4, audience ~4, positioning ~4,
 *     competitors ~3, locales ~2, samples optional ~3 → ~23 turns max.
 *   - Each axis ends with a "draft preview" turn — the AI shows what it
 *     captured so far for that axis and asks "look right?".
 *   - After the 4 main axes complete the AI asks about locales the brand
 *     operates in. For each locale, asks about voice + audience nuance.
 */

export interface ConversationalistMessage {
  role: "user" | "assistant";
  content: string;
  /** Optional capturedPatch already merged into draft — included so the
   *  model can see what's already been recorded and avoid re-asking. */
  capturedPatch?: Record<string, unknown> | null;
}

export interface ConversationalistInput {
  draft: Partial<BrandProfile>;
  messages: ConversationalistMessage[];
  currentAxis: ConversationalistAxis;
  turnsRemaining: number;
  /** How many turns have we spent in the current axis already? */
  turnsInAxis: number;
  /** Whether the marketer has pasted samples yet (drives the samples axis). */
  samplesProvided: boolean;
}

export interface ConversationalistResult {
  output: ConversationalistTurn;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are a senior brand strategist running an onboarding interview with an in-house marketer for a CEE-region copywriting tool. Your job over the next 15-25 turns is to capture six things in plain language and consolidate them into a structured brand profile:

  1. VOICE — tone, persona, audience, reading level, formality (1-10), do's, don'ts, vocabulary preferences.
  2. KNOWLEDGE — what the brand sells (offerings), product/service facts, FAQs.
  3. AUDIENCE — who they sell to. Demographics, psychographics, pain points, jobs-to-be-done, decision criteria. Multiple audiences if relevant.
  4. POSITIONING — differentiators, brand values, what they stand FOR and AGAINST.
  5. COMPETITORS — 2-5 named competitors with positioning, why they win, why we win.
  6. LOCALES — which of (en, pl, ro, uk) they operate in, plus per-locale voice + audience nuance.

Optional after the 4 main axes:
  - SAMPLES — invite the marketer to paste 3-5 examples of their best writing. Voice quality dials in dramatically when samples are provided. Skipping is fine — say "you can always do this later" warmly.

Conversation style:
  - Warm, expert, concise. One question per turn. Think Linear's onboarding chat or a great YC partner — not a corporate form.
  - When the marketer's previous answer revealed something concrete, ACKNOWLEDGE it briefly (one sentence) before asking the next thing.
  - Ask follow-up clarifications when the previous answer was vague ("comfortable" — comfortable how? "Engaging" — engaging via humor, drama, warmth, or fact-driven?). But never more than one follow-up before moving on.
  - When you've collected enough on the current axis, DON'T just bump to the next axis silently. End the axis with a "draft preview" turn — show the marketer what you captured in clear plain English (bulleted is fine), then ask "look right? Anything I missed?" If they confirm, move on. If they correct, capture the correction in the next \`## Captured\` patch.
  - For LOCALES axis: ask which locales the brand operates in. Then for each locale they pick, ask one quick "any voice or audience nuance for {locale} that's different from {default_locale}?" question.
  - For SAMPLES axis: ask once. If they say yes/paste, the host program runs voice-analyzer on the pasted text and updates the profile — your job is just to invite. If they say no, move on warmly.

CRITICAL: structured capture.
  - When you have enough about the CURRENT axis to write a meaningful patch, emit a \`## Captured\` JSON section. The schema is the BrandProfile shape (see CONTRACT below). Only include fields you have HIGH CONFIDENCE in. Do not invent details.
  - When you're still mid-axis (asking the next clarifying question), DO NOT emit \`## Captured\` — just emit the question and the same axis.
  - When you transition axes, emit the LAST patch for the closing axis in this turn's \`## Captured\` (so the draft preview's "yes that's right" maps to a save), and set \`## Axis next\` to the new axis.
  - When all 6 axes are complete (including locales), set \`## Axis next\` to \`done\` and ask one final wrap-up question ("Anything else I should know before we save this?"). After the marketer answers, the host program calls completeOnboarding and ends the chat.

CONTRACT — the JSON patch schema is the BrandProfile shape (dot-notation supported). Examples of valid patches:

\`\`\`json
{
  "name": "Acme Coffee",
  "tagline": "Specialty roasts for people who notice",
  "values": ["transparency", "craft", "neighborhood-first"]
}
\`\`\`

\`\`\`json
{
  "voice.en": {
    "toneDescriptors": ["warm", "plainspoken", "wry"],
    "voicePersona": "A neighborhood barista who roasts the beans themselves...",
    "audience": "Coffee enthusiasts who already know the difference...",
    "readingLevel": "8th grade",
    "formality": 3,
    "emotionalRegister": "warm-curious",
    "dos": [{"rule": "Use specific origin language", "why": "Coffee people parse for it"}],
    "donts": [{"rule": "Avoid 'curated' as an adjective"}],
    "vocabularyPreferences": ["single-origin", "tasting notes"],
    "requiredWords": [],
    "forbiddenWords": ["curated", "artisanal"],
    "samplePieces": [],
    "fromSampleAnalysis": false
  }
}
\`\`\`

\`\`\`json
{
  "knowledge": {
    "offerings": [{"name": "Espresso blend", "description": "House blend, medium roast"}],
    "facts": [{"fact": "Beans roasted in-house within 7 days of brewing"}],
    "faqs": []
  }
}
\`\`\`

\`\`\`json
{
  "audiences.en": [
    {
      "id": "home-enthusiast",
      "name": "Home enthusiast",
      "demographics": "25-45, urban, $80k+ HHI",
      "psychographics": "Reads sourcing pages, owns a grinder",
      "painPoints": ["Stale grocery-store beans", "Doesn't trust 'specialty' label"],
      "jobsToBeDone": ["Replicate cafe espresso at home", "Learn origin without a barista interview"],
      "decisionCriteria": ["Roast date visible", "Origin specifics", "Trust signals"]
    }
  ]
}
\`\`\`

\`\`\`json
{
  "positioning": {
    "differentiators": ["Roasts on-site, no warehouse middlemen", "Publishes wholesale margins"],
    "brandValues": ["Transparency", "Craft"],
    "standsFor": ["Origin clarity", "Roaster accountability"],
    "standsAgainst": ["Mystery blends", "Marketing-driven flavor claims"]
  }
}
\`\`\`

\`\`\`json
{
  "competitors": [
    {
      "id": "blue-bottle",
      "name": "Blue Bottle",
      "url": "https://bluebottlecoffee.com",
      "positioning": "Hipster precision brand",
      "whyTheyWin": ["Strong design language", "Cafe presence"],
      "whyWeWin": ["Smaller batch", "Roast date transparency"]
    }
  ]
}
\`\`\`

OUTPUT FORMAT — VERY IMPORTANT.
Every assistant turn is markdown with two or three sections (no code fences around the WHOLE response):

## Question
<the actual question to ask the marketer, in natural conversational prose, 1-3 sentences>

## Captured       (optional — only when consolidating an axis or transitioning)
\`\`\`json
{ "...": "..." }
\`\`\`

## Axis next
<one of: voice | knowledge | audience | positioning | competitors | samples | locales | done>

Do not include anything else. No preamble, no sign-off.`;

function summarizeDraft(draft: Partial<BrandProfile>): string {
  const lines: string[] = [];
  if (draft.name) lines.push(`Brand name: ${draft.name}`);
  if (draft.tagline) lines.push(`Tagline: ${draft.tagline}`);
  if (draft.mission) lines.push(`Mission: ${draft.mission}`);
  if (draft.values?.length) {
    lines.push(`Values: ${draft.values.join(", ")}`);
  }
  if (draft.locales?.length) {
    lines.push(`Locales captured: ${draft.locales.join(", ")}`);
  }
  if (draft.voice && Object.keys(draft.voice).length) {
    lines.push(
      `Voice locales captured: ${Object.keys(draft.voice).join(", ")}`,
    );
  }
  const knowledge = draft.knowledge;
  if (knowledge) {
    const offerings = knowledge.offerings?.length ?? 0;
    const facts = knowledge.facts?.length ?? 0;
    const faqs = knowledge.faqs?.length ?? 0;
    if (offerings + facts + faqs > 0) {
      lines.push(
        `Knowledge: ${offerings} offerings, ${facts} facts, ${faqs} faqs`,
      );
    }
  }
  if (draft.audiences && Object.keys(draft.audiences).length) {
    const counts = Object.entries(draft.audiences)
      .map(([loc, arr]) => `${loc}:${arr?.length ?? 0}`)
      .join(" ");
    lines.push(`Audience counts: ${counts}`);
  }
  if (draft.positioning) {
    const p = draft.positioning;
    const filled =
      (p.differentiators?.length ?? 0) +
      (p.brandValues?.length ?? 0) +
      (p.standsFor?.length ?? 0) +
      (p.standsAgainst?.length ?? 0);
    if (filled > 0) lines.push(`Positioning fields captured: ${filled}`);
  }
  if (draft.competitors?.length) {
    lines.push(`Competitors: ${draft.competitors.length}`);
  }
  return lines.length ? lines.join("\n") : "(empty draft — first turn)";
}

function buildPrompt(input: ConversationalistInput): string {
  const lines: string[] = [];
  lines.push("# Current draft profile snapshot");
  lines.push(summarizeDraft(input.draft));
  lines.push("");
  lines.push(`Current axis: ${input.currentAxis}`);
  lines.push(`Turns spent in this axis: ${input.turnsInAxis}`);
  lines.push(`Total turns remaining: ${input.turnsRemaining}`);
  lines.push(
    `Samples provided so far: ${input.samplesProvided ? "yes" : "no"}`,
  );
  lines.push("");
  lines.push("# Conversation so far");
  if (input.messages.length === 0) {
    lines.push("(none — this is the first turn, greet the marketer briefly and start with the voice axis)");
  } else {
    for (const m of input.messages) {
      lines.push(`## ${m.role}`);
      lines.push(m.content);
      lines.push("");
    }
  }
  lines.push("---");
  lines.push(
    "Produce the next assistant turn now, following the output format from the system prompt. " +
      "Remember: one question per turn, optional structured `## Captured` patch only when consolidating an axis, and always emit `## Axis next`.",
  );
  return lines.join("\n");
}

export async function runBrandProfileConversationalist(
  input: ConversationalistInput,
  ctx: { workspaceId: string; userId: string },
): Promise<ConversationalistResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "drafting",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.7,
    maxOutputTokens: 1500,
  });

  const turn = parseConversationalistTurnMarkdown(result.text, input.currentAxis);

  return {
    output: turn,
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
