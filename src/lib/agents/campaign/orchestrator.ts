import "server-only";
import { runAgent, type AgentContext } from "../core";
import { runCopywriterDrafter } from "../copywriter/drafter";
import { runVoiceAuditor, type VoiceAudit } from "../voice-auditor";
import type { VoiceCardForPrompt, Locale } from "../voice-card";
import type { Channel, ChannelComponent } from "@/db/schema";
import {
  campaignPlanner,
  type CampaignPlannerOutput,
  type CampaignPlannerInput,
} from "./planner";

export interface CampaignOrchestratorInput {
  voice?: VoiceCardForPrompt & { id: string };
  name: string;
  objective: string;
  audienceOverride?: string;
  productInfo?: string;
  locale: Locale;
  requestedChannels: CampaignPlannerInput["requestedChannels"];
  /** Pre-formatted KB excerpts (already retrieved by the caller). */
  knowledge?: string;
  /**
   * Per-channel component schemas. Looked up by the caller from
   * `channel_definition` and keyed by Channel id. When an asset's channel
   * has a schema here, the drafter is asked for one labeled section per
   * component instead of free-form copy. Channels without a schema in this
   * map fall back to the single-shot drafter (back-compat for campaigns
   * that target legacy channel ids without definitions).
   */
  componentSchemas?: Partial<Record<Channel, ChannelComponent[]>>;
}

export interface CampaignAssetResult {
  seq: number;
  channel: CampaignPlannerOutput["assets"][number]["channel"];
  label: string;
  strategy: string;
  content: string;
  /**
   * When the channel had a component schema, this map carries the model's
   * text per component id. Caller persists it to
   * `campaign_asset.components`. Null when the channel had no schema
   * (single-shot drafter path) — the caller stores `content` only in that
   * case.
   */
  components: Record<string, string> | null;
  rationale: string;
  audit: VoiceAudit | null;
  modelIds: { drafter: string; auditor: string | null };
  durationMs: { drafter: number; auditor: number | null };
}

export interface CampaignRunResult {
  plan: CampaignPlannerOutput;
  assets: CampaignAssetResult[];
  totalDurationMs: number;
  modelIds: { planner: string };
}

/**
 * Orchestrates the campaign flow:
 *   1. Campaign Planner — decides strategy + hook + asset list.
 *   2. For each planned asset, run Copywriter Drafter (parallel).
 *   3. For each draft, run Voice Auditor (parallel) — only when a voice is
 *      attached. Otherwise audit is skipped (no voice to audit against).
 *
 * KB retrieval is the caller's responsibility — they pass `knowledge`
 * already formatted. The same block goes to the planner and to every
 * drafter.
 */
export async function runCampaign(
  input: CampaignOrchestratorInput,
  ctx: AgentContext,
): Promise<CampaignRunResult> {
  const start = Date.now();

  // Step 1 — plan
  const plannerResult = await runAgent(
    campaignPlanner,
    {
      voice: input.voice,
      name: input.name,
      objective: input.objective,
      audienceOverride: input.audienceOverride,
      productInfo: input.productInfo,
      locale: input.locale,
      requestedChannels: input.requestedChannels,
      knowledge: input.knowledge,
    },
    ctx,
  );

  const plan = plannerResult.output;
  // Cap at 10 assets defensively (schema also caps).
  const planned = plan.assets.slice(0, 10);

  if (planned.length === 0) {
    throw new Error("Campaign planner produced no assets.");
  }

  // Step 2 — draft each asset in parallel.
  const draftPromises = planned.map((asset) => {
    const components = input.componentSchemas?.[asset.channel as Channel];
    return runCopywriterDrafter(
      {
        voice: input.voice ?? {
          name: "(no voice)",
          toneDescriptors: [],
          voicePersona: null,
          audience: null,
          readingLevel: null,
          dos: [],
          donts: [],
          requiredWords: [],
          forbiddenWords: [],
          localeNotes: {},
        },
        channel: asset.channel,
        locale: input.locale,
        objective: input.objective,
        audienceOverride: input.audienceOverride,
        productInfo: input.productInfo,
        length: asset.length_hint,
        angle: {
          label: asset.label,
          strategy: asset.angle,
          // The Drafter wants a candidate hook — fall back to the campaign hook
          // if the asset's angle didn't specify one.
          hook: plan.hook,
        },
        knowledge: input.knowledge,
        components,
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId },
    );
  });

  const drafts = await Promise.all(draftPromises);

  // Step 3 — audit (only if a voice is attached).
  const auditPromises = input.voice
    ? drafts.map((draft) =>
        runVoiceAuditor(
          {
            voice: input.voice!,
            draft: draft.output.content,
            locale: input.locale,
          },
          { workspaceId: ctx.workspaceId, userId: ctx.userId },
        ),
      )
    : null;

  const audits = auditPromises ? await Promise.all(auditPromises) : null;

  const assets: CampaignAssetResult[] = planned.map((asset, i) => {
    const drafter = drafts[i];
    const auditor = audits?.[i];
    return {
      seq: i,
      channel: asset.channel,
      label: asset.label,
      strategy: asset.angle,
      content: drafter.output.content,
      components: drafter.output.components ?? null,
      rationale: drafter.output.rationale,
      audit: auditor?.output ?? null,
      modelIds: {
        drafter: drafter.modelId,
        auditor: auditor?.modelId ?? null,
      },
      durationMs: {
        drafter: drafter.durationMs,
        auditor: auditor?.durationMs ?? null,
      },
    };
  });

  return {
    plan,
    assets,
    totalDurationMs: Date.now() - start,
    modelIds: { planner: plannerResult.modelId },
  };
}
