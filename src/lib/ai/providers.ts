import "server-only";
import { eq, and } from "drizzle-orm";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";

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
 * Every provider in the apiKeys enum has a factory. OpenRouter is the
 * default gateway (one key, every model), but power users can route
 * specific roles through direct keys to skip OpenRouter's markup, or through
 * Ollama for fully air-gapped self-host.
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
  /** Returns an AI SDK LanguageModel for the given model id. */
  model(modelId: string): LanguageModel;
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
      model: (modelId: string) => router.chat(modelId) as LanguageModel,
    };
  },

  anthropic: ({ apiKey, baseUrl }) => {
    const anthropic = createAnthropic({
      apiKey,
      baseURL: baseUrl ?? undefined,
    });
    return {
      model: (modelId: string) => anthropic(modelId) as LanguageModel,
    };
  },

  openai: ({ apiKey, baseUrl }) => {
    const openai = createOpenAI({
      apiKey,
      baseURL: baseUrl ?? undefined,
    });
    return {
      model: (modelId: string) => openai(modelId) as LanguageModel,
    };
  },

  google: ({ apiKey, baseUrl }) => {
    const google = createGoogleGenerativeAI({
      apiKey,
      baseURL: baseUrl ?? undefined,
    });
    return {
      model: (modelId: string) => google(modelId) as LanguageModel,
    };
  },

  mistral: ({ apiKey, baseUrl }) => {
    const mistral = createMistral({
      apiKey,
      baseURL: baseUrl ?? undefined,
    });
    return {
      model: (modelId: string) => mistral(modelId) as LanguageModel,
    };
  },

  ollama: ({ baseUrl }) => {
    // Ollama runs locally — no API key. baseUrl points at the user's
    // Ollama instance (default http://localhost:11434/api).
    const ollama = createOllama({
      baseURL: baseUrl ?? "http://localhost:11434/api",
    });
    return {
      model: (modelId: string) => ollama(modelId) as LanguageModel,
    };
  },
};

/* ----------------------------------------------------------------------------
 * Resolve a model for a given role
 * -------------------------------------------------------------------------- */

export interface ResolveModelOptions {
  workspaceId: string;
  /** Use the workspace's default for this role. Ignored if `modelId` is set. */
  role?: ModelRole;
  /** Specific model id (provider-native, e.g. "claude-sonnet-4-5-20250929"). */
  modelId?: string;
  /** Override which provider routes the call. Defaults to "openrouter". */
  provider?: ApiKeyProvider;
}

export interface ResolvedModel {
  model: LanguageModel;
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

  if (!keyRow && provider !== "ollama") {
    throw new Error(
      `No API key configured for provider "${provider}" in this workspace. Add one in Settings → AI Providers.`,
    );
  }

  const factory = PROVIDER_FACTORIES[provider];
  if (!factory) {
    throw new Error(
      `Provider "${provider}" is not yet implemented.`,
    );
  }

  // Ollama doesn't need a real key but the row stores the base URL.
  const apiKey = keyRow ? decryptSecret(keyRow.ciphertext) : "";
  const instance = factory({ apiKey, baseUrl: keyRow?.baseUrl ?? null });
  return {
    model: instance.model(modelId),
    modelId,
    provider,
  };
}
