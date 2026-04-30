import "server-only";
import { and, cosineDistance, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { kbChunks, kbSources, type KbChunk } from "@/db/schema";
import { embedQuery } from "@/lib/ai/embeddings";

export interface KnowledgeSearchOptions {
  workspaceId: string;
  /** Restrict to specific source ids. Empty array → search across the workspace. */
  sourceIds?: string[];
  /** Top-K results. Default 6. */
  topK?: number;
  /** Minimum similarity (0..1). Default 0.4 to prune irrelevant matches. */
  minSimilarity?: number;
}

export interface KnowledgeHit {
  chunk: KbChunk;
  similarity: number;
  source: { id: string; name: string };
}

export async function searchKnowledge(
  query: string,
  opts: KnowledgeSearchOptions,
): Promise<KnowledgeHit[]> {
  if (!query.trim()) return [];

  const { vector, modelId } = await embedQuery(query, {
    workspaceId: opts.workspaceId,
  });

  const topK = opts.topK ?? 6;
  const minSim = opts.minSimilarity ?? 0.4;

  // similarity = 1 - cosine_distance. Drizzle exposes cosineDistance helper.
  const similarity = sql<number>`1 - (${cosineDistance(
    kbChunks.embedding,
    vector,
  )})`;

  const conditions = [
    eq(kbChunks.workspaceId, opts.workspaceId),
    eq(kbSources.status, "ready"),
    // Only search chunks indexed with the same model — comparing across
    // embedding spaces produces meaningless similarity scores.
    eq(kbSources.embeddingModel, modelId),
    gt(similarity, minSim),
  ];
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    conditions.push(inArray(kbChunks.sourceId, opts.sourceIds));
  }

  const rows = await db
    .select({
      chunk: kbChunks,
      sourceId: kbSources.id,
      sourceName: kbSources.name,
      similarity,
    })
    .from(kbChunks)
    .innerJoin(kbSources, eq(kbChunks.sourceId, kbSources.id))
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(topK);

  return rows.map((r) => ({
    chunk: r.chunk,
    similarity: r.similarity,
    source: { id: r.sourceId, name: r.sourceName },
  }));
}

/** Format a list of knowledge hits for prompt injection. */
export function formatKnowledgeForPrompt(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return "";
  const lines: string[] = [];
  lines.push("# Retrieved knowledge");
  lines.push(
    "(Verbatim excerpts from your knowledge base. Use as factual grounding; don't invent specifics not present here.)",
  );
  hits.forEach((h, i) => {
    lines.push(
      `\n[${i + 1}] from "${h.source.name}" (similarity ${h.similarity.toFixed(2)}):`,
    );
    lines.push(h.chunk.content.trim());
  });
  return lines.join("\n");
}
