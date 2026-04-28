"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { modelDefaults, type ModelRole } from "@/db/schema";
import { getCurrentWorkspace, requireRole } from "@/lib/auth/workspace";

const SetSchema = z.object({
  role: z.enum(["planning", "drafting", "fast", "critic"]) satisfies z.ZodType<ModelRole>,
  modelId: z.string().min(1).max(200),
  provider: z
    .enum(["openrouter", "anthropic", "openai", "google", "mistral", "ollama"])
    .default("openrouter"),
});

export async function setModelDefault(input: unknown): Promise<void> {
  const parsed = SetSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  const existing = await db.query.modelDefaults.findFirst({
    where: and(
      eq(modelDefaults.workspaceId, workspace.id),
      eq(modelDefaults.role, parsed.role),
    ),
  });

  if (existing) {
    await db
      .update(modelDefaults)
      .set({
        modelId: parsed.modelId,
        provider: parsed.provider,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(modelDefaults.workspaceId, workspace.id),
          eq(modelDefaults.role, parsed.role),
        ),
      );
  } else {
    await db.insert(modelDefaults).values({
      workspaceId: workspace.id,
      role: parsed.role,
      modelId: parsed.modelId,
      provider: parsed.provider,
    });
  }

  revalidatePath("/settings/ai");
}
