"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  brandVoices,
  campaignAssets,
  campaigns,
  type Campaign,
  type CampaignPlan,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";
import {
  runCampaign,
  type CampaignOrchestratorInput,
  type CampaignRunResult,
} from "@/lib/agents/campaign";
import { searchKnowledge, formatKnowledgeForPrompt } from "@/lib/kb/search";
import type { VoiceCardForPrompt } from "@/lib/agents/voice-card";

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);
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

/* ----------------------------------------------------------------------------
 * Start a campaign run                                                       */
/* -------------------------------------------------------------------------- */

const StartSchema = z.object({
  name: z.string().min(2).max(160),
  voiceId: z.string().uuid().optional(),
  locale: LocaleEnum,
  objective: z.string().min(10).max(2000),
  audienceOverride: z.string().max(600).optional(),
  productInfo: z.string().max(4000).optional(),
  requestedChannels: z.array(ChannelEnum).min(1).max(8),
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
});

export interface CampaignStartResult {
  campaignId: string;
}

export async function startCampaignRun(
  input: unknown,
): Promise<CampaignStartResult> {
  const brief = StartSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  let voice: typeof brandVoices.$inferSelect | undefined;
  if (brief.voiceId) {
    voice = await db.query.brandVoices.findFirst({
      where: and(
        eq(brandVoices.id, brief.voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    });
    if (!voice) throw new Error("VOICE_NOT_FOUND");
  }

  // Create the campaign row immediately so the UI can navigate to a detail
  // page and watch the run come in.
  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: workspace.id,
      name: brief.name,
      objective: brief.objective,
      audienceOverride: brief.audienceOverride ?? null,
      productInfo: brief.productInfo ?? null,
      voiceId: voice?.id ?? null,
      locale: brief.locale,
      requestedChannels: brief.requestedChannels,
      sourceIds: brief.sourceIds ?? [],
      status: "running",
      createdByUserId: userId,
    })
    .returning({ id: campaigns.id });

  const cardForPrompt: (VoiceCardForPrompt & { id: string }) | undefined = voice
    ? {
        id: voice.id,
        name: voice.name,
        toneDescriptors: voice.toneDescriptors,
        voicePersona: voice.voicePersona,
        audience: voice.audience,
        readingLevel: voice.readingLevel,
        dos: voice.dos,
        donts: voice.donts,
        requiredWords: voice.requiredWords,
        forbiddenWords: voice.forbiddenWords,
        signaturePhrases: voice.signaturePhrases,
        localeNotes: voice.localeNotes,
      }
    : undefined;

  // Optional KB retrieval — runs once, shared across planner + every drafter.
  let knowledge: string | undefined;
  if (brief.sourceIds && brief.sourceIds.length > 0) {
    try {
      const queryText = [brief.objective, brief.productInfo, brief.audienceOverride]
        .filter(Boolean)
        .join("\n");
      const hits = await searchKnowledge(queryText, {
        workspaceId: workspace.id,
        sourceIds: brief.sourceIds,
        topK: 10,
      });
      if (hits.length > 0) knowledge = formatKnowledgeForPrompt(hits);
    } catch (err) {
      console.warn("[campaign] knowledge retrieval failed:", err);
    }
  }

  // V2.4 — fetch the workspace's channel definitions for every channel
  // the brief targets. Lazy-seeds defaults for pre-V2.4 workspaces. The
  // orchestrator routes channels with a schema through the multi-component
  // drafter; channels without a schema fall through to the legacy single-shot
  // drafter.
  const componentSchemas: NonNullable<
    CampaignOrchestratorInput["componentSchemas"]
  > = {};
  try {
    const { getChannelDefinition } = await import(
      "@/server/actions/channels"
    );
    for (const channelId of brief.requestedChannels) {
      if (componentSchemas[channelId]) continue;
      const def = await getChannelDefinition(workspace.id, channelId);
      if (def && def.components.length > 0) {
        componentSchemas[channelId] = def.components;
      }
    }
  } catch (err) {
    // Non-fatal: missing schemas just route through the legacy drafter.
    console.warn("[campaign] channel definition lookup failed:", err);
  }

  const orchestratorInput: CampaignOrchestratorInput = {
    voice: cardForPrompt,
    name: brief.name,
    objective: brief.objective,
    audienceOverride: brief.audienceOverride,
    productInfo: brief.productInfo,
    locale: brief.locale,
    requestedChannels: brief.requestedChannels,
    knowledge,
    componentSchemas,
  };

  try {
    const result: CampaignRunResult = await runCampaign(orchestratorInput, {
      workspaceId: workspace.id,
      userId,
    });

    // Persist plan + assets atomically.
    await db.transaction(async (tx) => {
      await tx
        .update(campaigns)
        .set({
          plan: result.plan as CampaignPlan,
          plannerModelId: result.modelIds.planner,
          status: "succeeded",
          durationMs: result.totalDurationMs,
          updatedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id));

      if (result.assets.length > 0) {
        await tx.insert(campaignAssets).values(
          result.assets.map((a) => ({
            workspaceId: workspace.id,
            campaignId: campaign.id,
            voiceId: voice?.id ?? null,
            locale: brief.locale,
            seq: a.seq,
            channel: a.channel,
            label: a.label,
            strategy: a.strategy,
            content: a.content,
            // V2.4 — when the channel had a component schema, persist the
            // labelled map. Asset card prefers this over `content` when set.
            components: a.components,
            rationale: a.rationale,
            auditScore: a.audit?.overall_score ?? null,
            auditSummary: a.audit?.summary ?? null,
            auditStrengths: a.audit?.strengths ?? [],
            auditIssues: a.audit?.issues ?? [],
            drafterModelId: a.modelIds.drafter,
            auditorModelId: a.modelIds.auditor,
          })),
        );
      }
    });

    revalidatePath(`/campaigns/${campaign.id}`);
    revalidatePath("/campaigns");
    return { campaignId: campaign.id };
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(campaigns)
      .set({
        status: "failed",
        error: message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));
    revalidatePath(`/campaigns/${campaign.id}`);
    throw err;
  }
}

/* ----------------------------------------------------------------------------
 * Asset actions                                                              */
/* -------------------------------------------------------------------------- */

export async function saveCampaignAsset(assetId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(campaignAssets)
    .set({ status: "saved", savedAt: new Date() })
    .where(
      and(
        eq(campaignAssets.id, assetId),
        eq(campaignAssets.workspaceId, workspace.id),
      ),
    );
}

export async function discardCampaignAsset(assetId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(campaignAssets)
    .set({ status: "discarded" })
    .where(
      and(
        eq(campaignAssets.id, assetId),
        eq(campaignAssets.workspaceId, workspace.id),
      ),
    );
}

/* ----------------------------------------------------------------------------
 * Campaign actions                                                           */
/* -------------------------------------------------------------------------- */

export async function deleteCampaign(campaignId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  await db
    .delete(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/campaigns");
  redirect("/campaigns");
}

/* ----------------------------------------------------------------------------
 * Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listCampaigns(): Promise<
  Array<Campaign & { voice?: { id: string; name: string } | null; assetCount: number }>
> {
  const { workspace } = await getCurrentWorkspace();
  const rows = await db.query.campaigns.findMany({
    where: eq(campaigns.workspaceId, workspace.id),
    orderBy: [desc(campaigns.createdAt)],
    with: {
      voice: { columns: { id: true, name: true } },
      assets: { columns: { id: true } },
    },
    limit: 50,
  });
  return rows.map((r) => ({
    ...r,
    assetCount: r.assets?.length ?? 0,
  }));
}

export async function getCampaign(campaignId: string) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.id, campaignId),
      eq(campaigns.workspaceId, workspace.id),
    ),
    with: {
      voice: true,
      assets: { orderBy: [asc(campaignAssets.seq)] },
    },
  });
}
