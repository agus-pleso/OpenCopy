import "server-only";
import { eq, and } from "drizzle-orm";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV1 } from "ai";

import { db } from "@/db/client";
import {
  apiKeys,
  modelDefaults,
  type ApiKeyProvider,
  type ModelRole,
} from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";

/* ----------------------------------------------------------------------------
 * Provider registry
 *
 * The thesis: OpenCopy uses OpenRouter as the default gateway, but the model
 * resolver is provider-agnostic. To add direct keys (Anthropic, OpenAI) or a
 * local Ollama instance later, register a new factory in PROVIDER_FACTORIES
 * and the rest of the application keeps working.
 * -------------------------------------------------------------------------- */

export const KNOWN_PROVIDERS: ApiKeyProvider[] = [
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "mistral",
  "ollama",
];

interface ProviderInstance {
  /** Returns an AI SDK LanguageModelV1 for the given model id. */
  model(modelId: string): LanguageModelV1;
}

type ProviderFactory = (args: {
  apiKey: string;
  baseUrl?: string | null;
}) => ProviderInstance;

const PROVIDER_FACTORIES: Partial<Record<ApiKeyProvider, ProviderFactory>> = {
  openrouter: ({ apiKey, baseUrl }) => {
    const router = createOpenRouter({
      apiKey,
      baseURL: baseUrl ?? undefined,
    });
    return {
      model: (modelId: string) => router.chat(modelId) as LanguageModelV1,
    };
  },
  // anthropic / openai / google / mistral / ollama land in V1.5.
};

/* ----------------------------------------------------------------------------
 * Resolve a model for a given role
 * -------------------------------------------------------------------------- */

export interface ResolveModelOptions {
  workspaceId: string;
  /** Use the workspace's default for this role. Ignored if `modelId` is set. */
  role?: ModelRole;
  /** Specific OpenRouter-style model id (e.g. "anthropic/claude-sonnet-4.6"). */
  modelId?: string;
  /** Override which provider routes the call. Defaults to "openrouter". */
  provider?: ApiKeyProvider;
}

export interface ResolvedModel {
  model: LanguageModelV1;
  modelId: string;
  provider: ApiKeyProvider;
}

export async function resolveModel(
  opts: ResolveModelOptions,
): Promise<ResolvedModel> {
  let modelId = opts.modelId;
  let provider: ApiKeyProvider = opts.provider ?? "openrouter";

  if (!modelId && opts.role) {
    const def = await db.query.modelDefaults.findFirst({
      where: and(
        eq(modelDefaults.workspaceId, opts.workspaceId),
        eq(modelDefaults.role, opts.role),
      ),
    });
    if (def) {
      modelId = def.modelId;
      provider = def.provider;
    }
  }

  if (!modelId) {
    throw new Error(
      `No model resolved (workspace=${opts.workspaceId}, role=${opts.role ?? "n/a"}). ` +
        `Set a default in Settings → AI Providers.`,
    );
  }

  const keyRow = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.workspaceId, opts.workspaceId),
      eq(apiKeys.provider, provider),
      eq(apiKeys.isActive, true),
    ),
  });

  if (!keyRow) {
    throw new Error(
      `No API key configured for provider "${provider}" in this workspace. Add one in Settings → AI Providers.`,
    );
  }

  const factory = PROVIDER_FACTORIES[provider];
  if (!factory) {
    throw new Error(
      `Provider "${provider}" is not yet implemented. OpenCopy V0.1 supports OpenRouter; direct providers + Ollama land in V1.5.`,
    );
  }

  const apiKey = decryptSecret(keyRow.ciphertext);
  const instance = factory({ apiKey, baseUrl: keyRow.baseUrl });
  return {
    model: instance.model(modelId),
    modelId,
    provider,
  };
}
