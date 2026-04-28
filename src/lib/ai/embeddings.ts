import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { apiKeys, KB_EMBEDDING_DIMENSIONS } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { DEFAULT_EMBEDDING_MODEL_ID } from "./embeddings-shared";

const OPENAI_BASE = "https://api.openai.com/v1";
/** Cap each batch at 100 inputs — well under OpenAI's 2048 limit. */
const BATCH_SIZE = 100;

export interface EmbeddingProviderContext {
  workspaceId: string;
  /** Override the workspace default. */
  modelId?: string;
}

export interface EmbedTextsResult {
  vectors: number[][];
  modelId: string;
  inputTokens: number;
}

/** Fetch the workspace's OpenAI key, throwing a friendly error if missing. */
async function getOpenAIKey(workspaceId: string): Promise<string> {
  const row = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.workspaceId, workspaceId),
      eq(apiKeys.provider, "openai"),
      eq(apiKeys.isActive, true),
    ),
  });
  if (!row) {
    throw new Error(
      "Knowledge base requires an OpenAI API key for embeddings. " +
        "Add one in Settings → AI Providers (Embeddings section).",
    );
  }
  return decryptSecret(row.ciphertext);
}

/** Verify an OpenAI key by hitting /models. */
export async function verifyOpenAIKey(apiKey: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  try {
    const res = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, message: text.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

/** Embed a batch of texts via OpenAI. Splits into smaller batches if needed. */
export async function embedTexts(
  texts: string[],
  ctx: EmbeddingProviderContext,
): Promise<EmbedTextsResult> {
  if (texts.length === 0) {
    return { vectors: [], modelId: DEFAULT_EMBEDDING_MODEL_ID, inputTokens: 0 };
  }

  const apiKey = await getOpenAIKey(ctx.workspaceId);
  const modelId = ctx.modelId ?? DEFAULT_EMBEDDING_MODEL_ID;

  const all: number[][] = new Array(texts.length);
  let inputTokens = 0;

  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const batch = texts.slice(offset, offset + BATCH_SIZE);
    const res = await fetch(`${OPENAI_BASE}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        input: batch,
        dimensions: KB_EMBEDDING_DIMENSIONS,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `OpenAI embeddings failed (${res.status}): ${errText.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as OpenAIEmbeddingResponse;
    json.data.forEach((d) => {
      all[offset + d.index] = d.embedding;
    });
    inputTokens += json.usage?.prompt_tokens ?? 0;
  }

  return { vectors: all, modelId, inputTokens };
}

/** Embed a single query string. Convenience wrapper around embedTexts. */
export async function embedQuery(
  text: string,
  ctx: EmbeddingProviderContext,
): Promise<{ vector: number[]; modelId: string; inputTokens: number }> {
  const { vectors, modelId, inputTokens } = await embedTexts([text], ctx);
  return { vector: vectors[0], modelId, inputTokens };
}

export { DEFAULT_EMBEDDING_MODEL_ID };
