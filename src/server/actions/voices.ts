"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, desc, asc, count } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  agentRuns,
  brandVoices,
  campaigns,
  chatThreads,
  copyVariants,
  documents,
  voiceSamples,
  voiceAudits,
  type BrandVoice,
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
  runVoiceAnalyzer,
  runVoiceAuditor,
  type VoiceAudit,
  type VoiceCard,
  type VoiceCardForPrompt,
} from "@/lib/agents";

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);

/* -------------------------------------------------------------------------- */
/* Voice CRUD                                                                 */
/* -------------------------------------------------------------------------- */

const CreateVoiceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  defaultLocale: LocaleEnum.default("en"),
});

export async function createVoice(input: unknown): Promise<{ id: string }> {
  const parsed = CreateVoiceSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const [created] = await db
    .insert(brandVoices)
    .values({
      workspaceId: workspace.id,
      name: parsed.name,
      description: parsed.description ?? null,
      defaultLocale: parsed.defaultLocale,
      createdByUserId: userId,
    })
    .returning({ id: brandVoices.id });

  revalidatePath("/voices");
  return { id: created.id };
}

const UpdateMetaSchema = z.object({
  voiceId: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  defaultLocale: LocaleEnum.optional(),
});

export async function updateVoiceMeta(input: unknown): Promise<void> {
  const parsed = UpdateMetaSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  await db
    .update(brandVoices)
    .set({
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && {
        description: parsed.description,
      }),
      ...(parsed.defaultLocale !== undefined && {
        defaultLocale: parsed.defaultLocale,
      }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(brandVoices.id, parsed.voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    );

  revalidatePath(`/voices/${parsed.voiceId}`);
  revalidatePath("/voices");
}

const VoiceCardRuleSchema = z.object({
  rule: z.string().min(2).max(220),
  why: z.string().max(220).optional(),
});

const UpdateCardSchema = z.object({
  voiceId: z.string().uuid(),
  toneDescriptors: z.array(z.string().min(1).max(40)).max(15).optional(),
  voicePersona: z.string().max(800).nullable().optional(),
  audience: z.string().max(600).nullable().optional(),
  readingLevel: z.string().max(60).nullable().optional(),
  dos: z.array(VoiceCardRuleSchema).max(20).optional(),
  donts: z.array(VoiceCardRuleSchema).max(20).optional(),
  requiredWords: z.array(z.string().min(1).max(40)).max(30).optional(),
  forbiddenWords: z.array(z.string().min(1).max(40)).max(30).optional(),
  rationale: z.string().max(1500).nullable().optional(),
  localeNotes: z
    .object({
      en: z.string().max(500).optional(),
      pl: z.string().max(500).optional(),
      ro: z.string().max(500).optional(),
      uk: z.string().max(500).optional(),
    })
    .optional(),
  setActive: z.boolean().optional(),
});

export async function updateVoiceCard(input: unknown): Promise<void> {
  const parsed = UpdateCardSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  await db
    .update(brandVoices)
    .set({
      ...(parsed.toneDescriptors !== undefined && {
        toneDescriptors: parsed.toneDescriptors,
      }),
      ...(parsed.voicePersona !== undefined && {
        voicePersona: parsed.voicePersona,
      }),
      ...(parsed.audience !== undefined && { audience: parsed.audience }),
      ...(parsed.readingLevel !== undefined && {
        readingLevel: parsed.readingLevel,
      }),
      ...(parsed.dos !== undefined && {
        dos: parsed.dos as VoiceCardRule[],
      }),
      ...(parsed.donts !== undefined && {
        donts: parsed.donts as VoiceCardRule[],
      }),
      ...(parsed.requiredWords !== undefined && {
        requiredWords: parsed.requiredWords,
      }),
      ...(parsed.forbiddenWords !== undefined && {
        forbiddenWords: parsed.forbiddenWords,
      }),
      ...(parsed.rationale !== undefined && { rationale: parsed.rationale }),
      ...(parsed.localeNotes !== undefined && {
        localeNotes: parsed.localeNotes as VoiceCardLocaleNotes,
      }),
      ...(parsed.setActive && { status: "active" as const }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(brandVoices.id, parsed.voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    );

  revalidatePath(`/voices/${parsed.voiceId}`);
  revalidatePath("/voices");
}

const StatusSchema = z.object({
  voiceId: z.string().uuid(),
  status: z.enum(["draft", "active", "archived"]),
});

export async function setVoiceStatus(input: unknown): Promise<void> {
  const parsed = StatusSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(brandVoices)
    .set({ status: parsed.status, updatedAt: new Date() })
    .where(
      and(
        eq(brandVoices.id, parsed.voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    );
  revalidatePath(`/voices/${parsed.voiceId}`);
  revalidatePath("/voices");
}

export async function deleteVoice(voiceId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  await db
    .delete(brandVoices)
    .where(
      and(
        eq(brandVoices.id, voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/voices");
  redirect("/voices");
}

/* -------------------------------------------------------------------------- */
/* Samples                                                                    */
/* -------------------------------------------------------------------------- */

const SampleInputSchema = z.object({
  content: z.string().min(40).max(20_000),
  locale: LocaleEnum.default("en"),
  sourceLabel: z.string().max(120).optional(),
});

const ReplaceSamplesSchema = z.object({
  voiceId: z.string().uuid(),
  samples: z.array(SampleInputSchema).max(20),
});

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Replace all samples for a voice in a single transaction. Simpler UX than
 *  add/remove for V0.2 — the editor manages the full set client-side. */
export async function replaceSamples(input: unknown): Promise<{ count: number }> {
  const parsed = ReplaceSamplesSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const owned = await db.query.brandVoices.findFirst({
    where: and(
      eq(brandVoices.id, parsed.voiceId),
      eq(brandVoices.workspaceId, workspace.id),
    ),
  });
  if (!owned) throw new Error("VOICE_NOT_FOUND");

  await db.transaction(async (tx) => {
    await tx.delete(voiceSamples).where(eq(voiceSamples.voiceId, parsed.voiceId));
    if (parsed.samples.length > 0) {
      await tx.insert(voiceSamples).values(
        parsed.samples.map((s) => ({
          voiceId: parsed.voiceId,
          workspaceId: workspace.id,
          content: s.content,
          locale: s.locale,
          sourceLabel: s.sourceLabel ?? null,
          wordCount: countWords(s.content),
        })),
      );
    }
  });

  revalidatePath(`/voices/${parsed.voiceId}`);
  return { count: parsed.samples.length };
}

/* -------------------------------------------------------------------------- */
/* Voice Analyzer agent                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Turn an opaque agent error (often a bare "Not Found" from a 404 response or
 * an AI SDK message) into something the user can act on. Detects the common
 * misconfigurations and points the user at the settings screen.
 */
function humanizeAgentError(err: unknown, role: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes("no model resolved")) {
    return `No model is set for the "${role}" role. Open Settings → AI Providers and pick one.`;
  }
  if (lower.includes("no api key")) {
    return raw;
  }
  if (
    lower.includes("no object generated") ||
    lower.includes("response did not match schema") ||
    lower.includes("response format didn't match") ||
    lower.includes("could not parse the response")
  ) {
    return `The model returned a response that didn't match the voice-card schema. This usually means the model is too small or the samples were too short. Try a stronger model in Settings → AI Providers, or paste longer samples.`;
  }
  if (
    lower === "not found" ||
    lower === "404 not found" ||
    lower.includes("not found") ||
    lower.includes("404")
  ) {
    return `The provider returned 404 — the model id for the "${role}" role isn't available with your API key. Open Settings → AI Providers and pick a different model.`;
  }
  if (lower.includes("401") || lower.includes("unauthorized")) {
    return `The provider rejected the API key. Re-check it in Settings → AI Providers.`;
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return `The provider is rate-limiting requests. Try again in a moment, or switch providers in Settings → AI Providers.`;
  }
  return raw;
}

const AnalyzeInputSchema = z.object({
  voiceId: z.string().uuid(),
});

export interface AnalyzeResult {
  ok: boolean;
  card?: VoiceCard;
  durationMs?: number;
  modelId?: string;
  message?: string;
}

export async function analyzeVoice(input: unknown): Promise<AnalyzeResult> {
  const parsed = AnalyzeInputSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const voice = await db.query.brandVoices.findFirst({
    where: and(
      eq(brandVoices.id, parsed.voiceId),
      eq(brandVoices.workspaceId, workspace.id),
    ),
    with: {
      samples: { orderBy: [asc(voiceSamples.createdAt)] },
    },
  });
  if (!voice) return { ok: false, message: "Voice not found." };
  if (!voice.samples || voice.samples.length === 0) {
    return {
      ok: false,
      message: "Add at least one writing sample before analyzing.",
    };
  }

  try {
    const result = await runVoiceAnalyzer(
      {
        name: voice.name,
        description: voice.description ?? undefined,
        samples: voice.samples.map((s) => ({
          content: s.content,
          locale: s.locale,
          label: s.sourceLabel,
        })),
      },
      { workspaceId: workspace.id, userId },
    );

    const card = result.output;

    await db
      .update(brandVoices)
      .set({
        toneDescriptors: card.tone_descriptors,
        voicePersona: card.voice_persona,
        audience: card.audience,
        readingLevel: card.reading_level,
        dos: card.dos.map((d) => ({ rule: d.rule, why: d.why })),
        donts: card.donts.map((d) => ({ rule: d.rule, why: d.why })),
        requiredWords: card.required_words,
        forbiddenWords: card.forbidden_words,
        rationale: card.rationale,
        analyzerModelId: result.modelId,
        analyzedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(brandVoices.id, parsed.voiceId));

    revalidatePath(`/voices/${parsed.voiceId}`);
    return {
      ok: true,
      card,
      durationMs: result.durationMs,
      modelId: result.modelId,
    };
  } catch (err) {
    return { ok: false, message: humanizeAgentError(err, "planning") };
  }
}

/* -------------------------------------------------------------------------- */
/* Voice Auditor agent                                                        */
/* -------------------------------------------------------------------------- */

const AuditInputSchema = z.object({
  voiceId: z.string().uuid(),
  draft: z.string().min(20).max(20_000),
  locale: LocaleEnum.optional(),
  /** When true, persist the audit run to history. */
  persist: z.boolean().default(true),
});

export interface AuditResult {
  ok: boolean;
  audit?: VoiceAudit;
  durationMs?: number;
  modelId?: string;
  message?: string;
}

export async function runVoiceAudit(input: unknown): Promise<AuditResult> {
  const parsed = AuditInputSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const voice = await db.query.brandVoices.findFirst({
    where: and(
      eq(brandVoices.id, parsed.voiceId),
      eq(brandVoices.workspaceId, workspace.id),
    ),
  });
  if (!voice) return { ok: false, message: "Voice not found." };

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

  try {
    const result = await runVoiceAuditor(
      {
        voice: cardForPrompt,
        draft: parsed.draft,
        locale: parsed.locale,
      },
      { workspaceId: workspace.id, userId },
    );

    const audit = result.output;

    if (parsed.persist) {
      await db.insert(voiceAudits).values({
        voiceId: parsed.voiceId,
        workspaceId: workspace.id,
        draftText: parsed.draft,
        overallScore: audit.overall_score,
        summary: audit.summary,
        strengths: audit.strengths,
        issues: audit.issues,
        modelId: result.modelId,
        createdByUserId: userId,
      });
    }

    return {
      ok: true,
      audit,
      durationMs: result.durationMs,
      modelId: result.modelId,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/* -------------------------------------------------------------------------- */
/* Read helpers                                                               */
/* -------------------------------------------------------------------------- */

export async function listVoices(): Promise<
  Array<BrandVoice & { sampleCount: number }>
> {
  const { workspace } = await getCurrentWorkspace();
  const rows = await db.query.brandVoices.findMany({
    where: eq(brandVoices.workspaceId, workspace.id),
    orderBy: [desc(brandVoices.updatedAt)],
    with: { samples: { columns: { id: true } } },
  });
  return rows.map((r) => ({
    ...r,
    sampleCount: r.samples?.length ?? 0,
  }));
}

export async function getVoiceWithSamples(voiceId: string) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.brandVoices.findFirst({
    where: and(
      eq(brandVoices.id, voiceId),
      eq(brandVoices.workspaceId, workspace.id),
    ),
    with: {
      samples: { orderBy: [asc(voiceSamples.createdAt)] },
    },
  });
}

export async function listVoiceLocaleOptions(): Promise<
  Array<{ value: Locale; label: string }>
> {
  return [
    { value: "en", label: "English" },
    { value: "pl", label: "Polski" },
    { value: "ro", label: "Română" },
    { value: "uk", label: "Українська" },
  ];
}

export interface VoiceUsage {
  runs: number;
  campaigns: number;
  threads: number;
  documents: number;
  savedVariants: number;
}

export async function getVoiceUsage(voiceId: string): Promise<VoiceUsage> {
  const { workspace } = await getCurrentWorkspace();

  const [
    [{ value: runsCount }],
    [{ value: campaignsCount }],
    [{ value: threadsCount }],
    [{ value: docsCount }],
    [{ value: savedCount }],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, workspace.id),
          eq(agentRuns.voiceId, voiceId),
        ),
      ),
    db
      .select({ value: count() })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.workspaceId, workspace.id),
          eq(campaigns.voiceId, voiceId),
        ),
      ),
    db
      .select({ value: count() })
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.workspaceId, workspace.id),
          eq(chatThreads.voiceId, voiceId),
        ),
      ),
    db
      .select({ value: count() })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspace.id),
          eq(documents.voiceId, voiceId),
        ),
      ),
    db
      .select({ value: count() })
      .from(copyVariants)
      .where(
        and(
          eq(copyVariants.workspaceId, workspace.id),
          eq(copyVariants.voiceId, voiceId),
          eq(copyVariants.status, "saved"),
        ),
      ),
  ]);

  return {
    runs: runsCount,
    campaigns: campaignsCount,
    threads: threadsCount,
    documents: docsCount,
    savedVariants: savedCount,
  };
}
