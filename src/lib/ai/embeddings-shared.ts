/**
 * Shared types for the embeddings provider system. Lives outside server-only
 * modules so client components can render provider-aware UI without dragging
 * server-only into the client bundle.
 */

export type EmbeddingProviderId = "openai" | "ollama" | "voyage";

/** Available embedding models. The `dimensions` here is the *native* output
 *  dimensionality of the model. Vectors smaller than KB_EMBEDDING_DIMENSIONS
 *  are zero-padded after L2 normalization (preserves cosine similarity). */
export interface EmbeddingModelMeta {
  id: string;
  provider: EmbeddingProviderId;
  label: string;
  dimensions: number;
  /** Approx $/1M tokens for telemetry display. Omitted for local models. */
  pricePer1MTokens?: number;
  multilingualHint?: string;
  /** True if the model runs locally (no API key, no $ cost). */
  local?: boolean;
}

export const EMBEDDING_MODELS: EmbeddingModelMeta[] = [
  {
    id: "text-embedding-3-small",
    provider: "openai",
    label: "OpenAI · text-embedding-3-small",
    dimensions: 1536,
    pricePer1MTokens: 0.02,
    multilingualHint: "Decent across PL/RO/UA. Lowest cost.",
  },
  {
    id: "text-embedding-3-large",
    provider: "openai",
    label: "OpenAI · text-embedding-3-large",
    dimensions: 1536,
    pricePer1MTokens: 0.13,
    multilingualHint: "Higher quality; same dimensions when you set dim=1536.",
  },
  {
    id: "nomic-embed-text",
    provider: "ollama",
    label: "Ollama · nomic-embed-text",
    dimensions: 768,
    local: true,
    multilingualHint: "Strong English; weaker on PL/RO/UA. ollama pull nomic-embed-text",
  },
  {
    id: "mxbai-embed-large",
    provider: "ollama",
    label: "Ollama · mxbai-embed-large",
    dimensions: 1024,
    local: true,
    multilingualHint: "Higher quality than nomic. ollama pull mxbai-embed-large",
  },
  {
    id: "bge-m3",
    provider: "ollama",
    label: "Ollama · bge-m3 (multilingual)",
    dimensions: 1024,
    local: true,
    multilingualHint: "Best multilingual coverage for PL/RO/UA. ollama pull bge-m3",
  },
];

export const DEFAULT_EMBEDDING_MODEL_ID = "text-embedding-3-small";
export const DEFAULT_OLLAMA_EMBEDDING_MODEL_ID = "nomic-embed-text";

export function getEmbeddingModelMeta(
  modelId: string,
): EmbeddingModelMeta | undefined {
  return EMBEDDING_MODELS.find((m) => m.id === modelId);
}
