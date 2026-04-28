/**
 * Shared types for the embeddings provider system. Lives outside server-only
 * modules so client components can render provider-aware UI without dragging
 * server-only into the client bundle.
 */

export type EmbeddingProviderId = "openai" | "voyage";

/** Available embedding models. V1.2 ships only the OpenAI defaults; V1.5 adds
 *  Voyage and direct Cohere. The numeric `dimensions` value MUST match
 *  KB_EMBEDDING_DIMENSIONS in db/schema.ts; mixing dims breaks vector search. */
export interface EmbeddingModelMeta {
  id: string;
  provider: EmbeddingProviderId;
  label: string;
  dimensions: number;
  /** Approx $/1M tokens for telemetry display. */
  pricePer1MTokens?: number;
  multilingualHint?: string;
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
];

export const DEFAULT_EMBEDDING_MODEL_ID = "text-embedding-3-small";
