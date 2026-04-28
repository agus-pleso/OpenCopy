"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { kbChunks, kbSources, type KbSource } from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";
import { chunkText } from "@/lib/kb/chunker";
import { searchKnowledge, type KnowledgeHit } from "@/lib/kb/search";
import {
  DEFAULT_EMBEDDING_MODEL_ID,
  embedTexts,
} from "@/lib/ai/embeddings";

/* ----------------------------------------------------------------------------
 * Internal: chunk + embed + persist                                          */
/* -------------------------------------------------------------------------- */

async function indexSource(
  sourceId: string,
  workspaceId: string,
  rawContent: string,
): Promise<{ chunkCount: number; tokenCount: number; modelId: string }> {
  const chunks = chunkText(rawContent);
  const totalTokens = chunks.reduce((acc, c) => acc + c.tokenCount, 0);

  if (chunks.length === 0) {
    await db
      .update(kbSources)
      .set({
        status: "ready",
        chunkCount: 0,
        tokenCount: 0,
        embeddingModel: DEFAULT_EMBEDDING_MODEL_ID,
        indexedAt: new Date(),
        updatedAt: new Date(),
        error: null,
      })
      .where(eq(kbSources.id, sourceId));
    return { chunkCount: 0, tokenCount: 0, modelId: DEFAULT_EMBEDDING_MODEL_ID };
  }

  const { vectors, modelId } = await embedTexts(
    chunks.map((c) => c.content),
    { workspaceId },
  );

  await db.transaction(async (tx) => {
    await tx.delete(kbChunks).where(eq(kbChunks.sourceId, sourceId));
    await tx.insert(kbChunks).values(
      chunks.map((c, i) => ({
        sourceId,
        workspaceId,
        seq: c.seq,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: vectors[i],
      })),
    );
    await tx
      .update(kbSources)
      .set({
        status: "ready",
        chunkCount: chunks.length,
        tokenCount: totalTokens,
        embeddingModel: modelId,
        indexedAt: new Date(),
        updatedAt: new Date(),
        error: null,
      })
      .where(eq(kbSources.id, sourceId));
  });

  return { chunkCount: chunks.length, tokenCount: totalTokens, modelId };
}

/* ----------------------------------------------------------------------------
 * CRUD                                                                       */
/* -------------------------------------------------------------------------- */

const CreateSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  rawContent: z.string().min(20).max(500_000),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export interface CreateSourceResult {
  ok: boolean;
  id?: string;
  message?: string;
}

export async function createKnowledgeSource(
  input: unknown,
): Promise<CreateSourceResult> {
  const parsed = CreateSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const [created] = await db
    .insert(kbSources)
    .values({
      workspaceId: workspace.id,
      name: parsed.name,
      description: parsed.description ?? null,
      rawContent: parsed.rawContent,
      tags: parsed.tags ?? [],
      status: "indexing",
      createdByUserId: userId,
    })
    .returning({ id: kbSources.id });

  try {
    await indexSource(created.id, workspace.id, parsed.rawContent);
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(kbSources)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(kbSources.id, created.id));
    revalidatePath("/knowledge");
    return { ok: false, id: created.id, message };
  }

  revalidatePath("/knowledge");
  return { ok: true, id: created.id };
}

const UpdateSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  rawContent: z.string().min(20).max(500_000).optional(),
});

export async function updateKnowledgeSource(input: unknown): Promise<{
  reindexed: boolean;
}> {
  const parsed = UpdateSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const updates: Partial<typeof kbSources.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.description !== undefined) updates.description = parsed.description;
  if (parsed.tags !== undefined) updates.tags = parsed.tags;
  if (parsed.rawContent !== undefined) {
    updates.rawContent = parsed.rawContent;
    updates.status = "indexing";
  }

  await db
    .update(kbSources)
    .set(updates)
    .where(
      and(
        eq(kbSources.id, parsed.sourceId),
        eq(kbSources.workspaceId, workspace.id),
      ),
    );

  if (parsed.rawContent !== undefined) {
    try {
      await indexSource(parsed.sourceId, workspace.id, parsed.rawContent);
    } catch (err) {
      const message = (err as Error).message;
      await db
        .update(kbSources)
        .set({ status: "failed", error: message })
        .where(eq(kbSources.id, parsed.sourceId));
      throw err;
    }
    revalidatePath(`/knowledge/${parsed.sourceId}`);
    revalidatePath("/knowledge");
    return { reindexed: true };
  }

  revalidatePath(`/knowledge/${parsed.sourceId}`);
  revalidatePath("/knowledge");
  return { reindexed: false };
}

export async function reindexKnowledgeSource(sourceId: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const source = await db.query.kbSources.findFirst({
    where: and(
      eq(kbSources.id, sourceId),
      eq(kbSources.workspaceId, workspace.id),
    ),
  });
  if (!source) return { ok: false, message: "Source not found." };

  await db
    .update(kbSources)
    .set({ status: "indexing", error: null, updatedAt: new Date() })
    .where(eq(kbSources.id, sourceId));

  try {
    await indexSource(sourceId, workspace.id, source.rawContent);
    revalidatePath(`/knowledge/${sourceId}`);
    revalidatePath("/knowledge");
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(kbSources)
      .set({ status: "failed", error: message })
      .where(eq(kbSources.id, sourceId));
    revalidatePath(`/knowledge/${sourceId}`);
    return { ok: false, message };
  }
}

export async function deleteKnowledgeSource(sourceId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .delete(kbSources)
    .where(
      and(eq(kbSources.id, sourceId), eq(kbSources.workspaceId, workspace.id)),
    );
  revalidatePath("/knowledge");
  redirect("/knowledge");
}

/* ----------------------------------------------------------------------------
 * Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listKnowledgeSources(): Promise<KbSource[]> {
  const { workspace } = await getCurrentWorkspace();
  return db.query.kbSources.findMany({
    where: eq(kbSources.workspaceId, workspace.id),
    orderBy: [desc(kbSources.updatedAt)],
  });
}

export async function getKnowledgeSource(sourceId: string) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.kbSources.findFirst({
    where: and(
      eq(kbSources.id, sourceId),
      eq(kbSources.workspaceId, workspace.id),
    ),
    with: {
      chunks: { orderBy: [asc(kbChunks.seq)], limit: 30 },
    },
  });
}

/* ----------------------------------------------------------------------------
 * Query                                                                      */
/* -------------------------------------------------------------------------- */

const QuerySchema = z.object({
  query: z.string().min(2).max(2000),
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

export interface KnowledgeQueryResult {
  ok: boolean;
  hits: Array<{
    sourceId: string;
    sourceName: string;
    seq: number;
    content: string;
    similarity: number;
  }>;
  message?: string;
}

export async function queryKnowledge(input: unknown): Promise<KnowledgeQueryResult> {
  const parsed = QuerySchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "viewer");

  try {
    const hits: KnowledgeHit[] = await searchKnowledge(parsed.query, {
      workspaceId: workspace.id,
      sourceIds: parsed.sourceIds,
      topK: parsed.topK,
    });
    return {
      ok: true,
      hits: hits.map((h) => ({
        sourceId: h.source.id,
        sourceName: h.source.name,
        seq: h.chunk.seq,
        content: h.chunk.content,
        similarity: h.similarity,
      })),
    };
  } catch (err) {
    return { ok: false, hits: [], message: (err as Error).message };
  }
}
