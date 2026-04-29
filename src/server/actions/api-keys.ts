"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { apiKeys, type ApiKeyProvider } from "@/db/schema";
import { encryptSecret, maskKey } from "@/lib/crypto";
import { getCurrentWorkspace, requireRole, requireUserId } from "@/lib/auth/workspace";
import { verifyOpenRouterKey } from "@/lib/ai/openrouter";
import { verifyOpenAIKey } from "@/lib/ai/embeddings";

const ProviderEnum = z.enum([
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "mistral",
  "ollama",
]) satisfies z.ZodType<ApiKeyProvider>;

const SaveSchema = z
  .object({
    provider: ProviderEnum,
    apiKey: z.string().min(0).max(2048),
    baseUrl: z.string().url().optional().or(z.literal("")),
    label: z.string().max(80).optional(),
  })
  .refine(
    (v) => {
      // Ollama allows empty key (local). All other providers need ≥8 chars.
      if (v.provider === "ollama") return true;
      return v.apiKey.length >= 8;
    },
    { message: "API key must be at least 8 characters.", path: ["apiKey"] },
  )
  .refine(
    (v) => {
      // Ollama needs a baseUrl (defaults are local but should be explicit).
      if (v.provider === "ollama") return !!v.baseUrl;
      return true;
    },
    {
      message: "Ollama requires a base URL (e.g. http://localhost:11434/api).",
      path: ["baseUrl"],
    },
  );

export interface SaveApiKeyResult {
  ok: boolean;
  message?: string;
  last4?: string;
}

export async function saveApiKey(input: unknown): Promise<SaveApiKeyResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  const userId = await requireUserId();

  const { provider, apiKey, baseUrl, label } = parsed.data;

  // Verify the key against the provider when we know how.
  if (provider === "openrouter") {
    const check = await verifyOpenRouterKey(apiKey);
    if (!check.ok) {
      return {
        ok: false,
        message: `OpenRouter rejected the key: ${check.message ?? "unknown error"}`,
      };
    }
  } else if (provider === "openai") {
    const check = await verifyOpenAIKey(apiKey);
    if (!check.ok) {
      return {
        ok: false,
        message: `OpenAI rejected the key: ${check.message ?? "unknown error"}`,
      };
    }
  }

  // Ollama stores a placeholder ciphertext — the baseUrl is what matters.
  const effectiveKey = provider === "ollama" ? "ollama-local" : apiKey;
  const ciphertext = encryptSecret(effectiveKey);
  const last4 =
    provider === "ollama" ? "local" : maskKey(apiKey, 4);

  const existing = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.workspaceId, workspace.id),
      eq(apiKeys.provider, provider),
    ),
  });

  if (existing) {
    await db
      .update(apiKeys)
      .set({
        ciphertext,
        last4,
        baseUrl: baseUrl || null,
        label: label || existing.label,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(apiKeys.id, existing.id));
  } else {
    await db.insert(apiKeys).values({
      workspaceId: workspace.id,
      provider,
      ciphertext,
      last4,
      baseUrl: baseUrl || null,
      label: label || null,
      createdByUserId: userId,
    });
  }

  revalidatePath("/settings/ai");
  return { ok: true, last4 };
}

export async function deleteApiKey(provider: ApiKeyProvider): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  await db
    .delete(apiKeys)
    .where(
      and(eq(apiKeys.workspaceId, workspace.id), eq(apiKeys.provider, provider)),
    );
  revalidatePath("/settings/ai");
}
