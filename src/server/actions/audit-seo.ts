"use server";

/**
 * SEO post-hoc audit server actions.
 *
 * Phase 2 wired the real `seo-auditor` agent into `runSeoAudit` and added
 * `generateSuggestionRewrite` for the diff modal's lazy "Generating
 * rewrite…" path. Auditor + apply signatures stayed identical to the Phase
 * 1C STUB — only the body of `runSeoAudit` changed.
 *
 * Auth pattern matches `voices.ts` / `documents.ts`: every action checks
 * `requireUserId` + `getCurrentWorkspace`, and every write is workspace-scoped
 * so multi-tenant access can never leak.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { db } from "@/db/client";
import {
  brandVoices,
  documents,
  seoAuditReports,
  type SeoAuditReport,
  type SeoSuggestion,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";
import { runAgent } from "@/lib/agents/core";
import { runSeoAuditor } from "@/lib/agents/seo-auditor";
import { seoSuggestionRewriter } from "@/lib/agents/copywriter";
import type { VoiceCardForPrompt } from "@/lib/agents/voice-card";
import { resolveModel } from "@/lib/ai/providers";

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const RunAuditSchema = z.object({
  docId: z.string().uuid(),
  primaryKeyword: z.string().trim().max(200).optional(),
  secondaryKeywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  inferKeyword: z.boolean().optional(),
});

const GenerateRewriteSchema = z.object({
  reportId: z.string().uuid(),
  suggestionId: z.string().min(1),
});

const ApplySchema = z.object({
  reportId: z.string().uuid(),
  suggestionId: z.string().min(1),
  editedProposed: z.string().max(20_000).optional(),
});

const RejectSchema = z.object({
  reportId: z.string().uuid(),
  suggestionId: z.string().min(1),
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort primary-keyword inference when the marketer leaves it blank.
 *
 * Two-tier:
 *   1. Use the doc title if it looks like a meaningful phrase (not
 *      "Untitled" and not just whitespace).
 *   2. Otherwise call the workspace's `fast`-role LLM to extract one.
 *
 * Returns the keyword + a flag indicating whether inference fired. The
 * auditor needs a non-empty primary to make density / semantic / SERP
 * meaningful, so we fall back to the doc's first 6 words on LLM failure
 * rather than returning empty.
 */
async function inferPrimaryKeyword(args: {
  workspaceId: string;
  title: string;
  text: string;
  locale: string;
}): Promise<string> {
  const cleanTitle = args.title.trim();
  if (cleanTitle && cleanTitle.toLowerCase() !== "untitled") {
    return cleanTitle;
  }
  try {
    const { model } = await resolveModel({
      workspaceId: args.workspaceId,
      role: "fast",
    });
    const sample = args.text.slice(0, 1500);
    const res = await generateText({
      model,
      system:
        "You extract the primary SEO target keyword from a piece of marketing copy. Reply with ONLY the keyword phrase, no quotes, no commentary. 2-5 words max. Match the locale.",
      prompt: `Locale: ${args.locale}\n\nContent:\n${sample}\n\nPrimary keyword:`,
      temperature: 0.2,
      maxOutputTokens: 30,
    });
    const inferred = res.text.trim().split("\n")[0]?.trim() ?? "";
    if (inferred && inferred.length <= 80) return inferred;
  } catch {
    // Fall through to title-or-first-words fallback.
  }
  return (
    cleanTitle ||
    args.text.trim().split(/\s+/).slice(0, 6).join(" ") ||
    "untitled topic"
  );
}

/**
 * Strip Tiptap HTML to plain text for the auditor / inference fallback. The
 * existing `contentText` column already holds this, but a fresh strip stays
 * tolerant to migration drift.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brandVoiceRowToPromptCard(
  row: typeof brandVoices.$inferSelect,
): VoiceCardForPrompt {
  return {
    name: row.name,
    toneDescriptors: row.toneDescriptors,
    voicePersona: row.voicePersona,
    audience: row.audience,
    readingLevel: row.readingLevel,
    dos: row.dos,
    donts: row.donts,
    requiredWords: row.requiredWords,
    forbiddenWords: row.forbiddenWords,
    signaturePhrases: row.signaturePhrases,
    localeNotes: row.localeNotes,
  };
}

/* -------------------------------------------------------------------------- */
/* runSeoAudit                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Run a real SEO audit against the doc.
 *
 *   1. Resolve the primary keyword — marketer-supplied, doc title, or
 *      LLM inference.
 *   2. Hand off to `runSeoAuditor` which orchestrates the 7 scorers + SERP
 *      fetch + suggestion generation. The auditor runs the scorers in
 *      parallel; SERP cache + 2 req/s rate limit are inside the fetcher.
 *   3. Persist the report. Suggestion shells store NO `proposed` text —
 *      that's filled lazily by `generateSuggestionRewrite` when the
 *      marketer opens the diff modal.
 *
 * Duration is mostly bounded by the SERP fetch (~5-10s on a cold cache for
 * 10 result pages) and the LLM suggestion call (~3-6s). Repeat audits on
 * the same keyword + locale within 24h hit the cache and complete in
 * ~3-6s.
 */
export async function runSeoAudit(input: {
  docId: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  inferKeyword?: boolean;
}): Promise<{ reportId: string }> {
  const parsed = RunAuditSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const doc = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, parsed.docId),
      eq(documents.workspaceId, workspace.id),
    ),
  });
  if (!doc) throw new Error("DOCUMENT_NOT_FOUND");

  const supplied = parsed.primaryKeyword?.trim() ?? "";
  const inferenceRequested = !!parsed.inferKeyword || supplied.length === 0;
  const docText = doc.contentText?.trim().length
    ? doc.contentText
    : htmlToText(doc.contentHtml);

  const primaryKeyword = inferenceRequested
    ? await inferPrimaryKeyword({
        workspaceId: workspace.id,
        title: doc.title,
        text: docText,
        locale: doc.locale,
      })
    : supplied;

  const secondaryKeywords = parsed.secondaryKeywords ?? [];

  const result = await runSeoAuditor(
    {
      docText,
      docHtml: doc.contentHtml,
      keywordCluster: {
        primary: primaryKeyword,
        secondary: secondaryKeywords,
      },
      locale: doc.locale,
      workspaceId: workspace.id,
      voiceId: doc.voiceId ?? undefined,
    },
    { userId },
  );

  const [created] = await db
    .insert(seoAuditReports)
    .values({
      workspaceId: workspace.id,
      documentId: doc.id,
      voiceId: doc.voiceId,
      locale: doc.locale,
      primaryKeyword,
      primaryKeywordInferred: inferenceRequested,
      secondaryKeywords,
      detectedIntent: result.output.detectedIntent,
      compositeScore: result.output.compositeScore,
      criterionScores: result.output.criterionScores,
      suggestions: result.output.suggestions,
      docTextSnapshot: docText,
      auditorModelId: result.modelId,
      copywriterModelId: null,
      durationMs: result.durationMs,
      createdByUserId: userId,
    })
    .returning({ id: seoAuditReports.id });

  revalidatePath(`/audit/${doc.id}`);
  return { reportId: created.id };
}

/* -------------------------------------------------------------------------- */
/* History / read helpers                                                     */
/* -------------------------------------------------------------------------- */

export async function getAuditHistory(docId: string): Promise<SeoAuditReport[]> {
  const { workspace } = await getCurrentWorkspace();
  return db.query.seoAuditReports.findMany({
    where: and(
      eq(seoAuditReports.documentId, docId),
      eq(seoAuditReports.workspaceId, workspace.id),
    ),
    orderBy: [desc(seoAuditReports.createdAt)],
    limit: 20,
  });
}

export async function getLatestAudit(
  docId: string,
): Promise<SeoAuditReport | null> {
  const { workspace } = await getCurrentWorkspace();
  const row = await db.query.seoAuditReports.findFirst({
    where: and(
      eq(seoAuditReports.documentId, docId),
      eq(seoAuditReports.workspaceId, workspace.id),
    ),
    orderBy: [desc(seoAuditReports.createdAt)],
  });
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* generateSuggestionRewrite                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Lazily fill a suggestion's `proposed` rewrite text via the copywriter
 * sub-agent. Idempotent — if `proposed` is already populated, returns it
 * unchanged without rerunning the LLM.
 *
 * Called by the diff preview modal on open. The audit step intentionally
 * doesn't pre-generate proposals because most marketers reject the
 * majority of suggestions; doing N×3-6s of LLM work eagerly is wasted
 * effort.
 */
export async function generateSuggestionRewrite(input: {
  reportId: string;
  suggestionId: string;
}): Promise<{ proposed: string; rationale: string; copywriterModelId: string }> {
  const parsed = GenerateRewriteSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const report = await db.query.seoAuditReports.findFirst({
    where: and(
      eq(seoAuditReports.id, parsed.reportId),
      eq(seoAuditReports.workspaceId, workspace.id),
    ),
  });
  if (!report) throw new Error("REPORT_NOT_FOUND");

  const suggestions = report.suggestions ?? [];
  const targetIdx = suggestions.findIndex((s) => s.id === parsed.suggestionId);
  if (targetIdx < 0) throw new Error("SUGGESTION_NOT_FOUND");
  const target = suggestions[targetIdx];

  // Idempotent — skip the LLM if a proposed text already exists.
  if (target.proposed && target.proposed.trim().length > 0) {
    return {
      proposed: target.proposed,
      rationale: "(cached from previous open)",
      copywriterModelId: report.copywriterModelId ?? "",
    };
  }

  let voiceCard: VoiceCardForPrompt | null = null;
  if (report.voiceId) {
    const voiceRow = await db.query.brandVoices.findFirst({
      where: and(
        eq(brandVoices.id, report.voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    });
    if (voiceRow) voiceCard = brandVoiceRowToPromptCard(voiceRow);
  }

  const rewrite = await runAgent(
    seoSuggestionRewriter,
    {
      voice: voiceCard,
      locale: report.locale,
      primaryKeyword: report.primaryKeyword,
      secondaryKeywords: report.secondaryKeywords,
      suggestionType: target.type,
      suggestionDescription: target.description,
      excerpt: target.excerpt,
    },
    { workspaceId: workspace.id, userId },
  );

  const updatedSuggestions: SeoSuggestion[] = suggestions.map((s, i) =>
    i === targetIdx ? { ...s, proposed: rewrite.output.proposed } : s,
  );

  await db
    .update(seoAuditReports)
    .set({
      suggestions: updatedSuggestions,
      copywriterModelId: rewrite.modelId,
    })
    .where(eq(seoAuditReports.id, report.id));

  return {
    proposed: rewrite.output.proposed,
    rationale: rewrite.output.rationale,
    copywriterModelId: rewrite.modelId,
  };
}

/* -------------------------------------------------------------------------- */
/* applySeoSuggestion                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Replace the suggestion's `excerpt` in the doc's HTML/text with the rewrite,
 * mark the suggestion `applied`, and persist both. Phase 2 enriches the
 * suggestion's `proposed` field via `generateSuggestionRewrite` before this
 * is called — the apply path itself doesn't change.
 *
 * Fallback `[placeholder rewrite]` is preserved so that if the modal ever
 * apply-clicks before generation completes (race), the round-trip stays
 * visible in dev instead of silently corrupting the doc.
 */
export async function applySeoSuggestion(input: {
  reportId: string;
  suggestionId: string;
  editedProposed?: string;
}): Promise<{ ok: true; newDocHtml: string }> {
  const parsed = ApplySchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const report = await db.query.seoAuditReports.findFirst({
    where: and(
      eq(seoAuditReports.id, parsed.reportId),
      eq(seoAuditReports.workspaceId, workspace.id),
    ),
  });
  if (!report) throw new Error("REPORT_NOT_FOUND");

  const suggestions = report.suggestions ?? [];
  const targetIdx = suggestions.findIndex((s) => s.id === parsed.suggestionId);
  if (targetIdx < 0) throw new Error("SUGGESTION_NOT_FOUND");
  const target = suggestions[targetIdx];

  const doc = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, report.documentId),
      eq(documents.workspaceId, workspace.id),
    ),
  });
  if (!doc) throw new Error("DOCUMENT_NOT_FOUND");

  const rewrite =
    parsed.editedProposed?.trim() ||
    target.proposed?.trim() ||
    "[placeholder rewrite]";

  // Read-modify-write the jsonb array. Drizzle treats jsonb columns
  // immutably — there's no "patch index" sugar, so we splice in JS and
  // persist the whole array back.
  const updatedSuggestions: SeoSuggestion[] = suggestions.map((s, i) =>
    i === targetIdx
      ? {
          ...s,
          status: "applied" as const,
          appliedAt: new Date().toISOString(),
          proposed: rewrite,
        }
      : s,
  );

  // Apply the rewrite to the live doc. STUB strategy: literal-string replace
  // of `excerpt` (if present) — Phase 2 likely refines this to a structural
  // patch, but the contract here is "the doc reflects the applied change".
  let newHtml = doc.contentHtml;
  let newText = doc.contentText;
  if (target.excerpt && target.excerpt.length > 0) {
    if (newHtml.includes(target.excerpt)) {
      newHtml = newHtml.split(target.excerpt).join(rewrite);
    }
    if (newText.includes(target.excerpt)) {
      newText = newText.split(target.excerpt).join(rewrite);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(seoAuditReports)
      .set({ suggestions: updatedSuggestions })
      .where(eq(seoAuditReports.id, report.id));

    await tx
      .update(documents)
      .set({
        contentHtml: newHtml,
        contentText: newText,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));
  });

  revalidatePath(`/audit/${doc.id}`);
  revalidatePath(`/documents/${doc.id}`);
  return { ok: true, newDocHtml: newHtml };
}

/* -------------------------------------------------------------------------- */
/* rejectSeoSuggestion                                                        */
/* -------------------------------------------------------------------------- */

export async function rejectSeoSuggestion(input: {
  reportId: string;
  suggestionId: string;
}): Promise<{ ok: true }> {
  const parsed = RejectSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const report = await db.query.seoAuditReports.findFirst({
    where: and(
      eq(seoAuditReports.id, parsed.reportId),
      eq(seoAuditReports.workspaceId, workspace.id),
    ),
  });
  if (!report) throw new Error("REPORT_NOT_FOUND");

  const suggestions = report.suggestions ?? [];
  const targetIdx = suggestions.findIndex((s) => s.id === parsed.suggestionId);
  if (targetIdx < 0) throw new Error("SUGGESTION_NOT_FOUND");

  const updatedSuggestions: SeoSuggestion[] = suggestions.map((s, i) =>
    i === targetIdx
      ? {
          ...s,
          status: "rejected" as const,
          rejectedAt: new Date().toISOString(),
        }
      : s,
  );

  await db
    .update(seoAuditReports)
    .set({ suggestions: updatedSuggestions })
    .where(eq(seoAuditReports.id, report.id));

  revalidatePath(`/audit/${report.documentId}`);
  return { ok: true };
}
