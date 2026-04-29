"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  agentRuns,
  agentRunSteps,
  brandVoices,
  copyVariants,
  type AgentKind,
  type CopywriterBrief,
  type LocalizerBrief,
  type Locale,
  type VoiceCardLocaleNotes,
  type VoiceCardRule,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";
import {
  runCopywriter,
  runLocalizer,
  copywriterRefiner,
  voiceAuditor,
  type VoiceAuditIssue,
  type VoiceCardForPrompt,
} from "@/lib/agents";
import { runAgent } from "@/lib/agents/core";
import { searchKnowledge, formatKnowledgeForPrompt } from "@/lib/kb/search";

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);

/* ----------------------------------------------------------------------------
 * Copywriter run                                                             */
/* -------------------------------------------------------------------------- */

const CopywriterBriefSchema = z.object({
  voiceId: z.string().uuid(),
  channel: z.enum([
    "ad",
    "email",
    "landing",
    "social",
    "blog",
    "headline",
    "product_description",
    "other",
  ]),
  locale: LocaleEnum,
  objective: z.string().min(10).max(2000),
  audienceOverride: z.string().max(600).optional(),
  productInfo: z.string().max(4000).optional(),
  length: z.string().max(80).optional(),
  variantCount: z.number().int().min(1).max(5),
  keywords: z.array(z.string().min(1).max(60)).max(15).optional(),
  forbiddenTerms: z.array(z.string().min(1).max(60)).max(15).optional(),
  examples: z.string().max(4000).optional(),
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
});

export interface CopywriterStartResult {
  runId: string;
}

export async function startCopywriterRun(input: unknown): Promise<CopywriterStartResult> {
  const brief = CopywriterBriefSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const voice = await db.query.brandVoices.findFirst({
    where: and(
      eq(brandVoices.id, brief.voiceId),
      eq(brandVoices.workspaceId, workspace.id),
    ),
  });
  if (!voice) throw new Error("VOICE_NOT_FOUND");

  // Create the run row immediately so the UI can navigate to a run page.
  const [run] = await db
    .insert(agentRuns)
    .values({
      workspaceId: workspace.id,
      kind: "copywriter",
      status: "running",
      voiceId: voice.id,
      brief: brief satisfies CopywriterBrief,
      createdByUserId: userId,
    })
    .returning({ id: agentRuns.id });

  // Run the orchestration synchronously. (V1.1 will add streaming via API route.)
  const cardForPrompt: VoiceCardForPrompt & { id: string } = {
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
    localeNotes: voice.localeNotes,
  };

  // Optional knowledge retrieval — runs once before the orchestrator and is
  // injected into both planner and drafters via the same formatted block.
  let knowledge: string | undefined;
  if (brief.sourceIds && brief.sourceIds.length > 0) {
    try {
      const queryText = [brief.objective, brief.productInfo, brief.audienceOverride]
        .filter(Boolean)
        .join("\n");
      const hits = await searchKnowledge(queryText, {
        workspaceId: workspace.id,
        sourceIds: brief.sourceIds,
        topK: 8,
      });
      if (hits.length > 0) knowledge = formatKnowledgeForPrompt(hits);
    } catch (err) {
      // KB failure is non-fatal — log it and proceed without grounding.
      console.warn("[copywriter] knowledge retrieval failed:", err);
    }
  }

  try {
    const result = await runCopywriter(
      {
        voice: cardForPrompt,
        channel: brief.channel,
        locale: brief.locale,
        objective: brief.objective,
        audienceOverride: brief.audienceOverride,
        productInfo: brief.productInfo,
        length: brief.length,
        variantCount: brief.variantCount,
        keywords: brief.keywords,
        forbiddenTerms: brief.forbiddenTerms,
        examples: brief.examples,
        knowledge,
      },
      { workspaceId: workspace.id, userId },
    );

    // Persist variants
    if (result.variants.length > 0) {
      await db.insert(copyVariants).values(
        result.variants.map((v) => ({
          workspaceId: workspace.id,
          runId: run.id,
          voiceId: voice.id,
          locale: brief.locale,
          seq: v.seq,
          label: v.label,
          strategy: v.strategy,
          content: v.content,
          auditScore: v.audit.overall_score,
          auditSummary: v.audit.summary,
          auditIssues: v.audit.issues,
          auditStrengths: v.audit.strengths,
        })),
      );
    }

    // Record steps for the timeline (planner + N drafters + N auditors).
    const steps: Array<typeof agentRunSteps.$inferInsert> = [];
    let seq = 0;
    steps.push({
      runId: run.id,
      seq: seq++,
      agentName: "copywriter-planner",
      status: "succeeded",
      modelId: result.modelIds.planner,
      inputTokens: result.plannerUsage.inputTokens ?? null,
      outputTokens: result.plannerUsage.outputTokens ?? null,
      output: result.plan as unknown as Record<string, unknown>,
    });
    result.variants.forEach((v) => {
      steps.push({
        runId: run.id,
        seq: seq++,
        agentName: "copywriter-drafter",
        status: "succeeded",
        modelId: v.modelIds.drafter,
        durationMs: v.durationMs.drafter,
        inputTokens: v.usage.drafter.inputTokens ?? null,
        outputTokens: v.usage.drafter.outputTokens ?? null,
        output: { label: v.label, rationale: v.rationale } as Record<string, unknown>,
      });
      steps.push({
        runId: run.id,
        seq: seq++,
        agentName: "voice-auditor",
        status: "succeeded",
        modelId: v.modelIds.auditor,
        durationMs: v.durationMs.auditor,
        inputTokens: v.usage.auditor.inputTokens ?? null,
        outputTokens: v.usage.auditor.outputTokens ?? null,
        output: v.audit as unknown as Record<string, unknown>,
      });
    });
    if (steps.length > 0) {
      await db.insert(agentRunSteps).values(steps);
    }

    await db
      .update(agentRuns)
      .set({
        status: "succeeded",
        durationMs: result.totalDurationMs,
        finishedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    revalidatePath(`/agents/runs/${run.id}`);
    revalidatePath("/agents");
    return { runId: run.id };
  } catch (err) {
    await db
      .update(agentRuns)
      .set({
        status: "failed",
        error: (err as Error).message,
        finishedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
    revalidatePath(`/agents/runs/${run.id}`);
    throw err;
  }
}

/* ----------------------------------------------------------------------------
 * Localizer run                                                              */
/* -------------------------------------------------------------------------- */

const LocalizerBriefSchema = z
  .object({
    voiceId: z.string().uuid().optional(),
    sourceLocale: LocaleEnum,
    targetLocale: LocaleEnum,
    sourceText: z.string().min(20).max(20000),
    contextHint: z.string().max(500).optional(),
  })
  .refine((v) => v.sourceLocale !== v.targetLocale, {
    message: "Source and target locale must differ.",
    path: ["targetLocale"],
  });

export async function startLocalizerRun(input: unknown): Promise<{ runId: string }> {
  const brief = LocalizerBriefSchema.parse(input);
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

  const [run] = await db
    .insert(agentRuns)
    .values({
      workspaceId: workspace.id,
      kind: "localizer",
      status: "running",
      voiceId: voice?.id ?? null,
      brief: brief satisfies LocalizerBrief,
      createdByUserId: userId,
    })
    .returning({ id: agentRuns.id });

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
        localeNotes: voice.localeNotes,
      }
    : undefined;

  try {
    const result = await runLocalizer(
      {
        voice: cardForPrompt,
        sourceText: brief.sourceText,
        sourceLocale: brief.sourceLocale,
        targetLocale: brief.targetLocale,
        contextHint: brief.contextHint,
      },
      { workspaceId: workspace.id, userId },
    );

    // Persist as a single variant
    await db.insert(copyVariants).values({
      workspaceId: workspace.id,
      runId: run.id,
      voiceId: voice?.id ?? null,
      locale: brief.targetLocale,
      seq: 0,
      label: `Localized → ${brief.targetLocale.toUpperCase()}`,
      strategy: result.adapter.formality_recommendation,
      content: result.target.target_text,
      auditScore: result.audit?.overall_score ?? null,
      auditSummary: result.audit?.summary ?? null,
      auditIssues: result.audit?.issues ?? [],
      auditStrengths: result.audit?.strengths ?? [],
      backTranslation: result.backTranslation.back_translation,
      culturalNotes: result.adapter.notes.map((n) => ({
        excerpt: n.excerpt,
        note: n.guidance,
      })),
    });

    // Steps timeline
    const steps: Array<typeof agentRunSteps.$inferInsert> = [];
    let seq = 0;
    steps.push({
      runId: run.id,
      seq: seq++,
      agentName: "localizer-cultural-adapter",
      status: "succeeded",
      modelId: result.modelIds.adapter,
      output: result.adapter as unknown as Record<string, unknown>,
    });
    steps.push({
      runId: run.id,
      seq: seq++,
      agentName: "localizer-transcreator",
      status: "succeeded",
      modelId: result.modelIds.localizer,
      output: result.target as unknown as Record<string, unknown>,
    });
    steps.push({
      runId: run.id,
      seq: seq++,
      agentName: "localizer-back-translator",
      status: "succeeded",
      modelId: result.modelIds.backTranslator,
      output: result.backTranslation as unknown as Record<string, unknown>,
    });
    if (result.audit && result.modelIds.auditor) {
      steps.push({
        runId: run.id,
        seq: seq++,
        agentName: "voice-auditor",
        status: "succeeded",
        modelId: result.modelIds.auditor,
        output: result.audit as unknown as Record<string, unknown>,
      });
    }
    await db.insert(agentRunSteps).values(steps);

    await db
      .update(agentRuns)
      .set({
        status: "succeeded",
        durationMs: result.totalDurationMs,
        finishedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    revalidatePath(`/agents/runs/${run.id}`);
    revalidatePath("/agents");
    return { runId: run.id };
  } catch (err) {
    await db
      .update(agentRuns)
      .set({
        status: "failed",
        error: (err as Error).message,
        finishedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
    throw err;
  }
}

/* ----------------------------------------------------------------------------
 * Refine an existing variant                                                 */
/* -------------------------------------------------------------------------- */

const RefineSchema = z.object({
  variantId: z.string().uuid(),
});

export async function refineVariant(input: unknown): Promise<{
  refinedContent: string;
  refinedScore: number;
}> {
  const parsed = RefineSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const variant = await db.query.copyVariants.findFirst({
    where: and(
      eq(copyVariants.id, parsed.variantId),
      eq(copyVariants.workspaceId, workspace.id),
    ),
  });
  if (!variant) throw new Error("VARIANT_NOT_FOUND");

  const voice = variant.voiceId
    ? await db.query.brandVoices.findFirst({
        where: eq(brandVoices.id, variant.voiceId),
      })
    : null;
  if (!voice) {
    throw new Error("Cannot refine — variant has no associated voice.");
  }

  const cardForPrompt: VoiceCardForPrompt = {
    name: voice.name,
    toneDescriptors: voice.toneDescriptors,
    voicePersona: voice.voicePersona,
    audience: voice.audience,
    readingLevel: voice.readingLevel,
    dos: voice.dos,
    donts: voice.donts,
    requiredWords: voice.requiredWords,
    forbiddenWords: voice.forbiddenWords,
    localeNotes: voice.localeNotes,
  };

  const issues = (variant.auditIssues ?? []) as VoiceAuditIssue[];

  // Refiner pass
  const refined = await runAgent(
    copywriterRefiner,
    {
      voice: cardForPrompt,
      draft: variant.content,
      issues,
    },
    { workspaceId: workspace.id, userId },
  );

  // Re-audit the refined version
  const reaudit = await runAgent(
    voiceAuditor,
    {
      voice: cardForPrompt,
      draft: refined.output.refined_content,
      locale: variant.locale,
    },
    { workspaceId: workspace.id, userId },
  );

  await db
    .update(copyVariants)
    .set({
      refinedContent: refined.output.refined_content,
      refinedScore: reaudit.output.overall_score,
    })
    .where(eq(copyVariants.id, parsed.variantId));

  // Append a refiner step
  const lastStep = await db.query.agentRunSteps.findFirst({
    where: eq(agentRunSteps.runId, variant.runId),
    orderBy: [desc(agentRunSteps.seq)],
  });
  await db.insert(agentRunSteps).values({
    runId: variant.runId,
    seq: (lastStep?.seq ?? 0) + 1,
    agentName: "copywriter-refiner",
    status: "succeeded",
    modelId: refined.modelId,
    durationMs: refined.durationMs,
    output: refined.output as unknown as Record<string, unknown>,
  });

  revalidatePath(`/agents/runs/${variant.runId}`);

  return {
    refinedContent: refined.output.refined_content,
    refinedScore: reaudit.output.overall_score,
  };
}

/* ----------------------------------------------------------------------------
 * Library actions                                                            */
/* -------------------------------------------------------------------------- */

export async function saveVariant(variantId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(copyVariants)
    .set({ status: "saved", savedAt: new Date() })
    .where(
      and(
        eq(copyVariants.id, variantId),
        eq(copyVariants.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/library");
}

export async function discardVariant(variantId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(copyVariants)
    .set({ status: "discarded" })
    .where(
      and(
        eq(copyVariants.id, variantId),
        eq(copyVariants.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/library");
}

export async function deleteRun(runId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  await db
    .delete(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspace.id)),
    );
  revalidatePath("/agents");
  redirect("/agents");
}

/* ----------------------------------------------------------------------------
 * Read helpers                                                               */
/* -------------------------------------------------------------------------- */

export async function listAgentRuns(opts?: {
  kind?: AgentKind;
  limit?: number;
}) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.agentRuns.findMany({
    where: opts?.kind
      ? and(
          eq(agentRuns.workspaceId, workspace.id),
          eq(agentRuns.kind, opts.kind),
        )
      : eq(agentRuns.workspaceId, workspace.id),
    orderBy: [desc(agentRuns.createdAt)],
    limit: opts?.limit ?? 25,
    with: {
      voice: { columns: { id: true, name: true } },
      variants: { columns: { id: true, auditScore: true, status: true } },
    },
  });
}

export async function getAgentRun(runId: string) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.agentRuns.findFirst({
    where: and(
      eq(agentRuns.id, runId),
      eq(agentRuns.workspaceId, workspace.id),
    ),
    with: {
      voice: true,
      steps: { orderBy: [agentRunSteps.seq] },
      variants: { orderBy: [copyVariants.seq] },
    },
  });
}

export async function listLibraryVariants(filter?: {
  voiceId?: string;
  locale?: Locale;
  status?: "saved" | "draft" | "all";
}) {
  const { workspace } = await getCurrentWorkspace();
  const conditions = [eq(copyVariants.workspaceId, workspace.id)];
  if (filter?.voiceId) conditions.push(eq(copyVariants.voiceId, filter.voiceId));
  if (filter?.locale) conditions.push(eq(copyVariants.locale, filter.locale));
  if (filter?.status && filter.status !== "all") {
    conditions.push(eq(copyVariants.status, filter.status));
  } else if (!filter?.status) {
    conditions.push(eq(copyVariants.status, "saved"));
  }

  return db.query.copyVariants.findMany({
    where: and(...conditions),
    orderBy: [desc(copyVariants.savedAt), desc(copyVariants.createdAt)],
    limit: 100,
    with: {
      voice: { columns: { id: true, name: true } },
      run: { columns: { id: true, kind: true, brief: true } },
    },
  });
}

// Re-export types so call-sites don't need to dig into schema.
export type { VoiceCardLocaleNotes, VoiceCardRule };
