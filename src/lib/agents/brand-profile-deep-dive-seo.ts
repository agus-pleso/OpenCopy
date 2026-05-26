import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import type { BrandProfile } from "@/db/schema";
import {
  parseDeepDiveTurnMarkdown,
  type DeepDiveTurn,
} from "./brand-profile-deep-dive-parser";

export {
  parseDeepDiveTurnMarkdown,
} from "./brand-profile-deep-dive-parser";
export type { DeepDiveTurn } from "./brand-profile-deep-dive-parser";

/**
 * SEO deep-dive agent.
 *
 * Short ~5-turn chat that captures SEO-specific config: target-keyword pool,
 * what success looks like, baseline ranking keywords (if any), preferred BYOK
 * provider (SEMrush / Ahrefs / DataForSEO / none).
 *
 * V1 stance: persist the transcript only — the SEO companion (auditor /
 * future SERP-aware rewriter) can read the chat history when it needs to
 * surface deep-dive context. We deliberately do NOT add ad-hoc keys to the
 * brand profile jsonb schema; the schema is fixed and an SEO sub-profile
 * doesn't fit any existing axis cleanly.
 */

export interface SeoDeepDiveMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SeoDeepDiveInput {
  profile: BrandProfile;
  messages: SeoDeepDiveMessage[];
  turnsRemaining: number;
}

export interface SeoDeepDiveResult {
  output: DeepDiveTurn;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const SYSTEM = `You are running a short SEO-onboarding chat with an in-house marketer. The marketer has just finished the main brand-profile onboarding; now you're collecting the SEO-specific config their SEO companion will use.

You have ~5 turns. Capture:
  1. TARGET KEYWORD POOL — the 5-20 keywords / topics they want to rank for. Push for specifics. If they say "anything coffee", ask "if you had to pick five queries to win, what would they be?".
  2. SUCCESS DEFINITION — what does winning look like? Page-1 for top-3 keywords by Q3? More demos from search? Drive trial signups?
  3. BASELINE RANKINGS — do they already rank for anything? If yes, get the top 3-5 keywords + current ranks. If no, that's fine — note it.
  4. BYOK SERP PROVIDER — would they like to bring their own keyword research API key (SEMrush, Ahrefs, DataForSEO) for better SERP data? Or skip and use the built-in scraper? Be honest that the built-in scraper is good enough for ~80% of cases.

Style: warm, focused, ONE question per turn. Acknowledge what the marketer just said (one sentence) before asking the next thing.

When you've collected all four pieces (or the marketer signals they want to wrap), mark the deep-dive complete.

OUTPUT FORMAT — VERY IMPORTANT.

## Question
<the question to ask the marketer, in natural conversational prose, 1-3 sentences>

## Complete       (only when you're done — value is "yes")
yes

Do not include anything else. No code fences around the whole response.`;

function buildPrompt(input: SeoDeepDiveInput): string {
  const lines: string[] = [];
  lines.push(`# Brand context`);
  lines.push(`Name: ${input.profile.name || "(empty)"}`);
  if (input.profile.tagline) lines.push(`Tagline: ${input.profile.tagline}`);
  if (input.profile.locales?.length) {
    lines.push(`Locales: ${input.profile.locales.join(", ")}`);
  }
  if (input.profile.knowledge?.offerings?.length) {
    lines.push(
      `Offerings: ${input.profile.knowledge.offerings.map((o) => o.name).slice(0, 5).join(", ")}`,
    );
  }
  if (input.profile.positioning?.differentiators?.length) {
    lines.push(
      `Differentiators: ${input.profile.positioning.differentiators.slice(0, 5).join("; ")}`,
    );
  }
  lines.push("");
  lines.push(`Turns remaining in this deep-dive: ${input.turnsRemaining}`);
  lines.push("");
  lines.push(`# Conversation so far`);
  if (input.messages.length === 0) {
    lines.push(
      "(none — this is the first turn, greet the marketer briefly and start with the target-keyword pool)",
    );
  } else {
    for (const m of input.messages) {
      lines.push(`## ${m.role}`);
      lines.push(m.content);
      lines.push("");
    }
  }
  lines.push("---");
  lines.push(
    "Produce the next assistant turn now, following the output format from the system prompt.",
  );
  return lines.join("\n");
}

export async function runBrandProfileSeoDeepDive(
  input: SeoDeepDiveInput,
  ctx: { workspaceId: string; userId: string },
): Promise<SeoDeepDiveResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "drafting",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.6,
    maxOutputTokens: 1000,
  });

  return {
    output: parseDeepDiveTurnMarkdown(result.text),
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
