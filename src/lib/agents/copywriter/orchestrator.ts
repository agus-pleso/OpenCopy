import "server-only";
import { runAgent, type AgentContext } from "../core";
import {
  voiceAuditor,
  type VoiceAudit,
} from "../voice-auditor";
import type { VoiceCardForPrompt, Locale } from "../voice-card";
import { copywriterPlanner, type PlannerOutput } from "./planner";
import { copywriterDrafter, type DrafterOutput } from "./drafter";

export interface CopywriterOrchestratorInput {
  voice: VoiceCardForPrompt & { id: string };
  channel: string;
  locale: Locale;
  objective: string;
  audienceOverride?: string;
  productInfo?: string;
  length?: string;
  variantCount: number;
  keywords?: string[];
  forbiddenTerms?: string[];
  examples?: string;
  /** Pre-formatted knowledge excerpts (already retrieved by the caller). */
  knowledge?: string;
}

export interface CopywriterVariant {
  seq: number;
  label: string;
  strategy: string;
  content: string;
  rationale: string;
  audit: VoiceAudit;
  modelIds: { drafter: string; auditor: string };
  durationMs: { drafter: number; auditor: number };
  usage: {
    drafter: { inputTokens?: number; outputTokens?: number };
    auditor: { inputTokens?: number; outputTokens?: number };
  };
}

export interface CopywriterRunResult {
  plan: PlannerOutput;
  variants: CopywriterVariant[];
  totalDurationMs: number;
  modelIds: { planner: string };
  plannerUsage: { inputTokens?: number; outputTokens?: number };
}

/**
 * Orchestrates the copywriter flow:
 *   1. Planner — produces N differentiated angles
 *   2. Drafters in parallel — one per angle
 *   3. Voice Auditor in parallel — one audit per variant
 *
 * The Refiner runs separately, only if the user clicks Refine on a variant.
 */
export async function runCopywriter(
  input: CopywriterOrchestratorInput,
  ctx: AgentContext,
): Promise<CopywriterRunResult> {
  const start = Date.now();

  // Step 1 — plan
  const plannerResult = await runAgent(
    copywriterPlanner,
    {
      voice: input.voice,
      channel: input.channel,
      locale: input.locale,
      objective: input.objective,
      audienceOverride: input.audienceOverride,
      productInfo: input.productInfo,
      length: input.length,
      variantCount: input.variantCount,
      keywords: input.keywords,
      forbiddenTerms: input.forbiddenTerms,
      examples: input.examples,
      knowledge: input.knowledge,
    },
    ctx,
  );

  const plan = plannerResult.output;
  const angles = plan.angles.slice(0, input.variantCount);

  if (angles.length === 0) {
    throw new Error("Planner produced no angles.");
  }

  // Step 2 — draft N variants in parallel
  const draftPromises = angles.map((angle) =>
    runAgent(
      copywriterDrafter,
      {
        voice: input.voice,
        channel: input.channel,
        locale: input.locale,
        objective: input.objective,
        audienceOverride: input.audienceOverride,
        productInfo: input.productInfo,
        length: input.length,
        keywords: input.keywords,
        forbiddenTerms: input.forbiddenTerms,
        angle: {
          label: angle.label,
          strategy: angle.strategy,
          hook: angle.hook,
          must_include: angle.must_include,
          avoid: angle.avoid,
        },
        knowledge: input.knowledge,
      },
      ctx,
    ),
  );
  const drafts = await Promise.all(draftPromises);

  // Step 3 — audit each variant in parallel
  const auditPromises = drafts.map((draft) =>
    runAgent(
      voiceAuditor,
      {
        voice: input.voice,
        draft: draft.output.content,
        locale: input.locale,
      },
      ctx,
    ),
  );
  const audits = await Promise.all(auditPromises);

  const variants: CopywriterVariant[] = angles.map((angle, i) => {
    const drafter = drafts[i];
    const auditor = audits[i];
    const draftOut: DrafterOutput = drafter.output;
    return {
      seq: i,
      label: angle.label,
      strategy: angle.strategy,
      content: draftOut.content,
      rationale: draftOut.rationale,
      audit: auditor.output,
      modelIds: {
        drafter: drafter.modelId,
        auditor: auditor.modelId,
      },
      durationMs: {
        drafter: drafter.durationMs,
        auditor: auditor.durationMs,
      },
      usage: {
        drafter: drafter.usage ?? {},
        auditor: auditor.usage ?? {},
      },
    };
  });

  return {
    plan,
    variants,
    totalDurationMs: Date.now() - start,
    modelIds: { planner: plannerResult.modelId },
    plannerUsage: plannerResult.usage ?? {},
  };
}
