"use server";

/**
 * SEO post-hoc audit server actions — Phase 1C STUB layer.
 *
 * The signatures defined here are part of the v2.5.x contract that Phase 2
 * wires into. The auditor agent (`src/lib/seo/**` + `seo-auditor.ts`) lives
 * in a parallel worktree and will replace the STUB body of `runSeoAudit` —
 * the input/output shape must NOT change.
 *
 * Auth pattern matches `voices.ts` / `documents.ts`: every action checks
 * `requireUserId` + `getCurrentWorkspace`, and every write is workspace-scoped
 * so multi-tenant access can never leak.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  documents,
  seoAuditReports,
  type SeoAuditReport,
  type SeoCriterionScore,
  type SeoCriterionScores,
  type SeoSuggestion,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const RunAuditSchema = z.object({
  docId: z.string().uuid(),
  primaryKeyword: z.string().trim().max(200).optional(),
  secondaryKeywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  inferKeyword: z.boolean().optional(),
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
/* runSeoAudit (STUB)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Insert a placeholder audit report so the UI can render end-to-end before
 * Phase 2 ships the real auditor. Composite score is hard-coded; criterion
 * scores all read 60; suggestion shells cover the most common types so the
 * Apply/Reject UX is exercisable.
 *
 * Phase 2 replaces the body — NOT the signature — with a `runSeoAuditor(...)`
 * call against the real scorer. The DB row schema is final.
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

  // STUB: every axis lands at 60 with a `stub:true` detail bag the UI can
  // pattern-match on later if it wants to render a "placeholder run" banner.
  const stubCriterion = (extra: Record<string, unknown> = {}): SeoCriterionScore => ({
    score: 60,
    details: { stub: true, ...extra },
  });

  const criterionScores: SeoCriterionScores = {
    density: stubCriterion({ count: 0, ratio: 0, target: 0.012 }),
    semantic: stubCriterion({ coverage: 0.5 }),
    intent: stubCriterion({ detected: "informational", target: "informational" }),
    structure: stubCriterion({ h1Count: 1, h2Count: 0, h3Count: 0 }),
    length: stubCriterion({ wordCount: doc.wordCount, target: 800 }),
    readability: stubCriterion({ flesch: 60, gradeLevel: 9 }),
    contentGap: stubCriterion({ missingTopics: [] }),
  };

  const primaryKeyword = parsed.primaryKeyword?.trim() || "";
  const inferred = !!parsed.inferKeyword || primaryKeyword.length === 0;

  const stubSuggestions: SeoSuggestion[] = [
    {
      id: crypto.randomUUID(),
      type: "rewrite_paragraph",
      status: "pending",
      excerpt:
        doc.contentText.slice(0, 240).trim() ||
        "Add an opening paragraph to anchor your primary keyword.",
      description:
        "The intro paragraph could lead with the primary keyword and frame the search intent more directly.",
    },
    {
      id: crypto.randomUUID(),
      type: "add_heading",
      status: "pending",
      description:
        "Consider adding an H2 that mirrors a top-ranking subtopic so the structure matches SERP expectations.",
    },
    {
      id: crypto.randomUUID(),
      type: "add_lsi_keyword",
      status: "pending",
      description:
        "Sprinkle in 2-3 semantically related terms — the audit ran in stub mode so it didn't actually mine the SERP.",
    },
  ];

  const [created] = await db
    .insert(seoAuditReports)
    .values({
      workspaceId: workspace.id,
      documentId: doc.id,
      voiceId: doc.voiceId,
      locale: doc.locale,
      primaryKeyword: primaryKeyword || "(inferred)",
      primaryKeywordInferred: inferred,
      secondaryKeywords: parsed.secondaryKeywords ?? [],
      detectedIntent: "informational",
      compositeScore: 60,
      criterionScores,
      suggestions: stubSuggestions,
      docTextSnapshot: doc.contentText,
      auditorModelId: null,
      copywriterModelId: null,
      durationMs: 0,
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
/* applySeoSuggestion (STUB)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Replace the suggestion's `excerpt` in the doc's HTML/text with the rewrite,
 * mark the suggestion `applied`, and persist both. Phase 2 enriches the
 * suggestion's `proposed` field before this is called — the apply path
 * itself doesn't change.
 *
 * The placeholder substring `[placeholder rewrite]` keeps the round-trip
 * obvious in dev when no real rewrite has been generated yet.
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
