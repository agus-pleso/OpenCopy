import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { apiKeys, workspaces, KB_EMBEDDING_DIMENSIONS } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_OLLAMA_EMBEDDING_MODEL_ID,
  getEmbeddingModelMeta,
  type EmbeddingProviderId,
} from "./embeddings-shared";

const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_OLLAMA_BASE = "http://localhost:11434/api";
/** Cap each batch at 100 inputs for OpenAI. Ollama handles one at a time. */
const OPENAI_BATCH_SIZE = 100;

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

interface EmbeddingResolution {
  provider: EmbeddingProviderId;
  modelId: string;
}

/**
 * Resolve which embedding provider + model to use for a workspace. Falls back
 * to OpenAI for backward compatibility — workspaces with NULL
 * `embedding_provider` behave as before.
 */
async function resolveEmbeddingConfig(
  workspaceId: string,
): Promise<EmbeddingResolution> {
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  const provider = (ws?.embeddingProvider as EmbeddingProviderId | null) ?? "openai";
  const modelId =
    ws?.embeddingModel ??
    (provider === "ollama"
      ? DEFAULT_OLLAMA_EMBEDDING_MODEL_ID
      : DEFAULT_EMBEDDING_MODEL_ID);
  return { provider, modelId };
}

/* ----------------------------------------------------------------------------
 * Vector helpers
 * -------------------------------------------------------------------------- */

/** L2-normalize so cosine similarity equals dot product. */
function l2Normalize(v: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) sumSq += v[i] * v[i];
  if (sumSq === 0) return v;
  const norm = Math.sqrt(sumSq);
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/**
 * Pad a vector with zeros to the target length. Combined with L2 normalization
 * this preserves cosine similarity ordering — extra zeros contribute zero to
 * the dot product and don't change the unit norm.
 */
function padToDimensions(v: number[], targetDim: number): number[] {
  if (v.length === targetDim) return v;
  if (v.length > targetDim) {
    throw new Error(
      `Embedding vector has ${v.length} dimensions but the schema is fixed at ${targetDim}. Pick a model with ≤${targetDim} dimensions.`,
    );
  }
  const out = new Array(targetDim);
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  for (let i = v.length; i < targetDim; i++) out[i] = 0;
  return out;
}

function normalizeAndPad(vec: number[]): number[] {
  return padToDimensions(l2Normalize(vec), KB_EMBEDDING_DIMENSIONS);
}

/* ----------------------------------------------------------------------------
 * OpenAI
 * -------------------------------------------------------------------------- */

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
        "Add one in Settings → AI Providers (Embeddings section), or switch to Ollama.",
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

async function embedTextsViaOpenAI(
  texts: string[],
  workspaceId: string,
  modelId: string,
): Promise<EmbedTextsResult> {
  const apiKey = await getOpenAIKey(workspaceId);
  const all: number[][] = new Array(texts.length);
  let inputTokens = 0;

  for (let offset = 0; offset < texts.length; offset += OPENAI_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + OPENAI_BATCH_SIZE);
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

/* ----------------------------------------------------------------------------
 * Ollama
 * -------------------------------------------------------------------------- */

async function getOllamaBaseUrl(workspaceId: string): Promise<string> {
  const row = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.workspaceId, workspaceId),
      eq(apiKeys.provider, "ollama"),
      eq(apiKeys.isActive, true),
    ),
  });
  return row?.baseUrl ?? DEFAULT_OLLAMA_BASE;
}

interface OllamaEmbeddingsResponse {
  embeddings: number[][];
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

async function embedOnceViaOllama(
  text: string,
  baseUrl: string,
  modelId: string,
): Promise<number[]> {
  const trimBase = baseUrl.replace(/\/$/, "");
  // Modern Ollama exposes /api/embed (batch). Older builds only have
  // /api/embeddings (single). Try the batch endpoint first.
  const batchRes = await fetch(`${trimBase}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, input: text }),
    cache: "no-store",
  });
  if (batchRes.ok) {
    const json = (await batchRes.json()) as OllamaEmbeddingsResponse;
    if (json.embeddings?.[0]) return json.embeddings[0];
  }

  const singleRes = await fetch(`${trimBase}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, prompt: text }),
    cache: "no-store",
  });
  if (!singleRes.ok) {
    const errText = await singleRes.text().catch(() => "");
    throw new Error(
      `Ollama embeddings failed (${singleRes.status}): ${
        errText.slice(0, 200) ||
        "Is Ollama running and is the model pulled? Try `ollama pull " +
          modelId +
          "`."
      }`,
    );
  }
  const json = (await singleRes.json()) as OllamaEmbeddingResponse;
  if (!json.embedding) {
    throw new Error("Ollama returned no embedding vector.");
  }
  return json.embedding;
}

async function embedTextsViaOllama(
  texts: string[],
  workspaceId: string,
  modelId: string,
): Promise<EmbedTextsResult> {
  const baseUrl = await getOllamaBaseUrl(workspaceId);
  const meta = getEmbeddingModelMeta(modelId);
  const expectedDim = meta?.dimensions;

  const vectors: number[][] = new Array(texts.length);
  // Sequential to avoid hammering local Ollama. Could parallelize with a
  // small concurrency pool if it becomes a bottleneck.
  for (let i = 0; i < texts.length; i++) {
    const raw = await embedOnceViaOllama(texts[i], baseUrl, modelId);
    if (expectedDim && raw.length !== expectedDim) {
      // Not fatal — the user might be using a different model than declared.
      // padToDimensions will still throw if raw.length > 1536.
    }
    vectors[i] = normalizeAndPad(raw);
  }

  return { vectors, modelId, inputTokens: 0 };
}

/* ----------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

/**
 * Verify an Ollama embedding model is reachable + pulled. Used by the settings
 * UI to give the user a green check before they save.
 */
export async function verifyOllamaEmbeddings(
  baseUrl: string,
  modelId: string,
): Promise<{ ok: boolean; dimensions?: number; message?: string }> {
  try {
    const vec = await embedOnceViaOllama("hello world", baseUrl, modelId);
    if (!Array.isArray(vec) || vec.length === 0) {
      return { ok: false, message: "Ollama returned no embedding vector." };
    }
    return { ok: true, dimensions: vec.length };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Embed a batch of texts. Routes by workspace embedding configuration. */
export async function embedTexts(
  texts: string[],
  ctx: EmbeddingProviderContext,
): Promise<EmbedTextsResult> {
  if (texts.length === 0) {
    return { vectors: [], modelId: DEFAULT_EMBEDDING_MODEL_ID, inputTokens: 0 };
  }

  const cfg = await resolveEmbeddingConfig(ctx.workspaceId);
  const modelId = ctx.modelId ?? cfg.modelId;

  // Per-call modelId override implies the caller knows the provider too —
  // look it up in the metadata table; fall back to the workspace provider.
  const meta = getEmbeddingModelMeta(modelId);
  const provider = meta?.provider ?? cfg.provider;

  if (provider === "ollama") {
    return embedTextsViaOllama(texts, ctx.workspaceId, modelId);
  }
  return embedTextsViaOpenAI(texts, ctx.workspaceId, modelId);
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
