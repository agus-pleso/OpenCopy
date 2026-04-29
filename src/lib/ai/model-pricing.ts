/**
 * Hardcoded pricing tables for direct providers. Used by the cost dashboard
 * to estimate spend on calls that didn't go through OpenRouter (whose /models
 * endpoint returns live pricing).
 *
 * Prices are USD per 1M tokens. Update as providers publish new models.
 * Last refresh: 2026-04 (Claude 4.6, GPT-4.1, Gemini 2.0 era).
 */

import type { ApiKeyProvider } from "@/db/schema";

export interface ModelPriceEntry {
  /** Model id as understood by the provider (NOT the OpenRouter slug). */
  id: string;
  label: string;
  /** $/1M input tokens. */
  prompt: number;
  /** $/1M output tokens. */
  completion: number;
  context?: number;
}

export const ANTHROPIC_PRICING: ModelPriceEntry[] = [
  { id: "claude-opus-4-7-20251201", label: "Claude Opus 4.7", prompt: 15, completion: 75, context: 1_000_000 },
  { id: "claude-sonnet-4-6-20251104", label: "Claude Sonnet 4.6", prompt: 3, completion: 15, context: 1_000_000 },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", prompt: 3, completion: 15, context: 200_000 },
  { id: "claude-haiku-4-5-20251015", label: "Claude Haiku 4.5", prompt: 0.8, completion: 4, context: 200_000 },
];

export const OPENAI_PRICING: ModelPriceEntry[] = [
  { id: "gpt-4.1", label: "GPT-4.1", prompt: 2.5, completion: 10, context: 1_000_000 },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", prompt: 0.4, completion: 1.6, context: 1_000_000 },
  { id: "gpt-4o", label: "GPT-4o", prompt: 2.5, completion: 10, context: 128_000 },
  { id: "gpt-4o-mini", label: "GPT-4o mini", prompt: 0.15, completion: 0.6, context: 128_000 },
  { id: "o3", label: "o3 (reasoning)", prompt: 2, completion: 8, context: 200_000 },
  { id: "o3-mini", label: "o3-mini (reasoning)", prompt: 1.1, completion: 4.4, context: 200_000 },
];

export const GOOGLE_PRICING: ModelPriceEntry[] = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", prompt: 0.1, completion: 0.4, context: 1_000_000 },
  { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro", prompt: 1.25, completion: 5, context: 2_000_000 },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", prompt: 0.075, completion: 0.3, context: 1_000_000 },
];

export const MISTRAL_PRICING: ModelPriceEntry[] = [
  { id: "mistral-large-latest", label: "Mistral Large", prompt: 2, completion: 6, context: 128_000 },
  { id: "mistral-small-latest", label: "Mistral Small", prompt: 0.2, completion: 0.6, context: 128_000 },
  { id: "mistral-nemo", label: "Mistral Nemo", prompt: 0.15, completion: 0.15, context: 128_000 },
];

/** Ollama runs locally — no per-token cost. We track tokens for transparency. */
export const OLLAMA_HINTS: ModelPriceEntry[] = [
  { id: "llama3.1:8b", label: "Llama 3.1 8B", prompt: 0, completion: 0 },
  { id: "llama3.3:70b", label: "Llama 3.3 70B", prompt: 0, completion: 0 },
  { id: "qwen2.5:14b", label: "Qwen 2.5 14B", prompt: 0, completion: 0 },
  { id: "qwen2.5:32b", label: "Qwen 2.5 32B", prompt: 0, completion: 0 },
  { id: "mistral-nemo:12b", label: "Mistral Nemo 12B", prompt: 0, completion: 0 },
];

export const PROVIDER_PRICING: Record<
  Exclude<ApiKeyProvider, "openrouter">,
  ModelPriceEntry[]
> = {
  anthropic: ANTHROPIC_PRICING,
  openai: OPENAI_PRICING,
  google: GOOGLE_PRICING,
  mistral: MISTRAL_PRICING,
  ollama: OLLAMA_HINTS,
};

/** Compute USD cost from input + output tokens. Returns 0 if model not found. */
export function estimateCost(
  provider: ApiKeyProvider,
  modelId: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  /** When provided (OpenRouter case), used directly. */
  pricing?: { prompt?: number | null; completion?: number | null },
): number {
  if (pricing && (pricing.prompt != null || pricing.completion != null)) {
    return (
      (inputTokens * (pricing.prompt ?? 0)) / 1_000_000 +
      (outputTokens * (pricing.completion ?? 0)) / 1_000_000
    );
  }
  if (provider === "openrouter") return 0; // caller should pass live pricing
  if (!modelId) return 0;
  const table = PROVIDER_PRICING[provider as Exclude<ApiKeyProvider, "openrouter">];
  if (!table) return 0;
  const entry = table.find((m) => m.id === modelId);
  if (!entry) return 0;
  return (
    (inputTokens * entry.prompt) / 1_000_000 +
    (outputTokens * entry.completion) / 1_000_000
  );
}

/** Friendly label for a provider id. */
export const PROVIDER_LABELS: Record<ApiKeyProvider, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral",
  ollama: "Ollama (local)",
};
