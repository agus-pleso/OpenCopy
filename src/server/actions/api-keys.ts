"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { apiKeys, type ApiKeyProvider } from "@/db/schema";
import { encryptSecret, maskKey } from "@/lib/crypto";
import { getCurrentWorkspace, requireRole, requireUserId } from "@/lib/auth/workspace";
import { verifyOpenRouterKey } from "@/lib/ai/openrouter";

const SaveSchema = z.object({
  provider: z.enum([
    "openrouter",
    "anthropic",
    "openai",
    "google",
    "mistral",
    "ollama",
  ]) satisfies z.ZodType<ApiKeyProvider>,
  apiKey: z.string().min(8).max(2048),
  baseUrl: z.string().url().optional().or(z.literal("")),
  label: z.string().max(80).optional(),
});

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

  // Verify the key when we know how to (currently OpenRouter).
  if (provider === "openrouter") {
    const check = await verifyOpenRouterKey(apiKey);
    if (!check.ok) {
      return {
        ok: false,
        message: `OpenRouter rejected the key: ${check.message ?? "unknown error"}`,
      };
    }
  }

  const ciphertext = encryptSecret(apiKey);
  const last4 = maskKey(apiKey, 4);

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
