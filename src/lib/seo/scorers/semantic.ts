import "server-only";

import type { SeoCriterionScore } from "@/db/schema";

/**
 * Embedding-based topic-similarity scorer.
 *
 * Embeds the doc body + the keyword cluster through Ollama's `bge-m3`
 * model (1024-dim, multilingual — covers en/pl/ro/uk). Cosine similarity
 * between the doc embedding and the keyword cluster embedding maps to a
 * 0-100 score.
 *
 * The Ollama host normalization mirrors the diary skill's `embed.ts`
 * pattern: `OLLAMA_HOST` is often set to `0.0.0.0:11434` (no scheme)
 * because that's the bind address; Node fetch needs a scheme + a
 * dialable host. We rewrite `0.0.0.0` → `localhost`.
 *
 * Falls back to a neutral 50/100 score if Ollama is unreachable rather
 * than failing the whole audit run. The details record carries the
 * failure mode so the UI can show a tooltip ("semantic scoring offline").
 */

const MODEL = process.env.OPENCOPY_SEO_EMBED_MODEL ?? "bge-m3";
const EMBED_DIM = 1024; // bge-m3 dimensions

function normalizeOllamaHost(): string {
  const raw = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/^http:\/\/0\.0\.0\.0/i, "http://localhost");
}

export interface SemanticScorerInput {
  /** Doc plain text. */
  text: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
}

export interface SemanticDetails extends Record<string, unknown> {
  cosine: number;
  model: string;
  /** Set when embedding failed; UI shows "semantic scoring offline". */
  offline?: boolean;
  error?: string;
}

/**
 * POST to Ollama's /api/embeddings endpoint. Returns the vector or
 * throws.
 */
export async function ollamaEmbed(
  text: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const host = normalizeOllamaHost();
  const res = await fetch(`${host}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: text }),
    signal,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Ollama embeddings ${res.status} ${res.statusText}: ${errBody.slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as { embedding?: number[] };
  const vec = body.embedding;
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error("Ollama returned no embedding");
  }
  return vec;
}

/**
 * Cosine similarity between two equally-dimensioned vectors. Returns 0
 * when either is the zero vector.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Map a cosine similarity (-1..1) onto a 0-100 score. Empirically,
 * relevant doc/keyword pairs land in [0.5, 0.85] with bge-m3;
 * 0.4 is the threshold where prose starts looking obviously off-topic.
 *
 * Curve: 0 at cosine ≤ 0.2, 100 at cosine ≥ 0.85, linear in between.
 */
export function cosineToScore(cosine: number): number {
  const lo = 0.2;
  const hi = 0.85;
  const t = (cosine - lo) / (hi - lo);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(clamped * 100);
}

export async function scoreSemantic(
  input: SemanticScorerInput,
  opts: { signal?: AbortSignal } = {},
): Promise<SeoCriterionScore> {
  const keywordText = [
    input.primaryKeyword,
    ...(input.secondaryKeywords ?? []),
  ]
    .filter((s) => s && s.trim())
    .join(" · ");

  if (!input.text.trim() || !keywordText.trim()) {
    return {
      score: 0,
      details: {
        cosine: 0,
        model: MODEL,
        offline: false,
      } satisfies SemanticDetails,
    };
  }

  try {
    const [docVec, kwVec] = await Promise.all([
      ollamaEmbed(input.text.slice(0, 12000), opts.signal),
      ollamaEmbed(keywordText, opts.signal),
    ]);
    if (docVec.length !== EMBED_DIM || kwVec.length !== EMBED_DIM) {
      // bge-m3 always returns 1024. If we got something else, the user
      // may have swapped to a different embed model.
      // Not a hard failure — still produces a usable cosine.
    }
    const cosine = cosineSimilarity(docVec, kwVec);
    return {
      score: cosineToScore(cosine),
      details: {
        cosine: Math.round(cosine * 1000) / 1000,
        model: MODEL,
      } satisfies SemanticDetails,
    };
  } catch (err) {
    return {
      score: 50,
      details: {
        cosine: 0,
        model: MODEL,
        offline: true,
        error: (err as Error).message.slice(0, 200),
      } satisfies SemanticDetails,
    };
  }
}
