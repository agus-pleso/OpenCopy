"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { workspaces } from "@/db/schema";
import { getCurrentWorkspace, requireRole } from "@/lib/auth/workspace";
import {
  verifyOllamaEmbeddings,
} from "@/lib/ai/embeddings";
import {
  getEmbeddingModelMeta,
  type EmbeddingProviderId,
} from "@/lib/ai/embeddings-shared";

const SaveSchema = z.object({
  provider: z.enum(["openai", "ollama"]),
  modelId: z.string().min(1).max(120),
});

export interface SaveEmbeddingPrefResult {
  ok: boolean;
  message?: string;
  /** The native dimensionality of the chosen model (Ollama only). */
  dimensions?: number;
}

/**
 * Save the workspace's embedding provider + model. For Ollama, also verifies
 * the local model is reachable and pulled before persisting.
 */
export async function saveEmbeddingPreference(
  input: unknown,
): Promise<SaveEmbeddingPrefResult> {
  const parsed = SaveSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  const meta = getEmbeddingModelMeta(parsed.modelId);
  if (!meta) {
    return { ok: false, message: `Unknown embedding model: ${parsed.modelId}` };
  }
  if (meta.provider !== parsed.provider) {
    return {
      ok: false,
      message: `Model ${parsed.modelId} doesn't belong to provider ${parsed.provider}.`,
    };
  }

  let dimensions: number | undefined;
  if (parsed.provider === "ollama") {
    const ollamaRow = await db.query.apiKeys.findFirst({
      where: (k, { and, eq }) =>
        and(eq(k.workspaceId, workspace.id), eq(k.provider, "ollama")),
    });
    const baseUrl = ollamaRow?.baseUrl ?? "http://localhost:11434/api";
    const verify = await verifyOllamaEmbeddings(baseUrl, parsed.modelId);
    if (!verify.ok) {
      return {
        ok: false,
        message:
          verify.message ??
          `Couldn't reach Ollama. Make sure it's running and you've pulled the model with \`ollama pull ${parsed.modelId}\`.`,
      };
    }
    dimensions = verify.dimensions;
  }

  await db
    .update(workspaces)
    .set({
      embeddingProvider: parsed.provider satisfies EmbeddingProviderId,
      embeddingModel: parsed.modelId,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath("/settings/ai");
  return { ok: true, dimensions };
}
