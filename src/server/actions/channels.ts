"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  channelDefinitions,
  type Channel,
  type ChannelComponent,
  type ChannelDefinition,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
} from "@/lib/auth/workspace";
import { DEFAULT_CHANNEL_DEFINITIONS } from "@/lib/channels/defaults";

/* ----------------------------------------------------------------------------
 * Lazy seed for pre-V2.4 workspaces.
 *
 * `ensureWorkspaceForUser` seeds the defaults on workspace creation, but
 * workspaces created BEFORE V2.4 don't have channel definitions. Settings
 * → Channels and the campaign builder both call this on entry, idempotent:
 * if any definition exists for the workspace, do nothing; otherwise seed.
 * -------------------------------------------------------------------------- */

export async function ensureChannelDefinitions(workspaceId: string): Promise<void> {
  const existing = await db.query.channelDefinitions.findFirst({
    where: eq(channelDefinitions.workspaceId, workspaceId),
    columns: { id: true },
  });
  if (existing) return;

  await db.insert(channelDefinitions).values(
    DEFAULT_CHANNEL_DEFINITIONS.map((def, idx) => ({
      workspaceId,
      channelId: def.channelId,
      label: def.label,
      components: def.components,
      ordering: idx,
    })),
  );
}

/* ----------------------------------------------------------------------------
 * Read
 * -------------------------------------------------------------------------- */

export async function listChannelDefinitions(): Promise<ChannelDefinition[]> {
  const { workspace } = await getCurrentWorkspace();
  await ensureChannelDefinitions(workspace.id);
  return db.query.channelDefinitions.findMany({
    where: eq(channelDefinitions.workspaceId, workspace.id),
    orderBy: [asc(channelDefinitions.ordering)],
  });
}

/**
 * Look up the component schema for one channel — used by the drafter at
 * generation time. Falls back to the default schema if the workspace's
 * row doesn't exist yet (older workspaces that never visited Settings).
 */
export async function getChannelDefinition(
  workspaceId: string,
  channelId: Channel,
): Promise<ChannelDefinition | null> {
  await ensureChannelDefinitions(workspaceId);
  const def = await db.query.channelDefinitions.findFirst({
    where: and(
      eq(channelDefinitions.workspaceId, workspaceId),
      eq(channelDefinitions.channelId, channelId),
    ),
  });
  return def ?? null;
}

/* ----------------------------------------------------------------------------
 * Update — label, components, prompts
 * -------------------------------------------------------------------------- */

const ComponentSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "id must be snake_case ASCII"),
  label: z.string().min(1).max(60),
  type: z.enum(["short", "long", "cta"]),
  required: z.boolean(),
  hint: z.string().max(240).optional(),
  maxLength: z.number().int().min(1).max(20_000).optional(),
  prompt: z.string().max(800).optional(),
});

const UpdateDefinitionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(60).optional(),
  components: z.array(ComponentSchema).max(20).optional(),
});

export async function updateChannelDefinition(
  input: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = UpdateDefinitionSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  // Validate that no two components in the same definition share an id.
  if (parsed.components) {
    const ids = parsed.components.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      return { ok: false, message: "Component ids must be unique within the channel." };
    }
  }

  await db
    .update(channelDefinitions)
    .set({
      ...(parsed.label !== undefined && { label: parsed.label }),
      ...(parsed.components !== undefined && {
        components: parsed.components as ChannelComponent[],
      }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(channelDefinitions.id, parsed.id),
        eq(channelDefinitions.workspaceId, workspace.id),
      ),
    );

  revalidatePath("/settings/channels");
  return { ok: true };
}

/* ----------------------------------------------------------------------------
 * Reorder — drag/drop or up/down. Caller passes ordered ids; ordering is
 * rewritten as 0..n-1. All ids must belong to the current workspace.
 * -------------------------------------------------------------------------- */

const ReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function reorderChannelDefinitions(
  input: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = ReorderSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  // Cross-check: every id passed in must be a real definition in this workspace.
  const owned = await db.query.channelDefinitions.findMany({
    where: and(
      eq(channelDefinitions.workspaceId, workspace.id),
      inArray(channelDefinitions.id, parsed.orderedIds),
    ),
    columns: { id: true },
  });
  if (owned.length !== parsed.orderedIds.length) {
    return { ok: false, message: "Some ids don't belong to this workspace." };
  }

  // Drizzle has no batched-update primitive — write each row's new ordering
  // individually. The list is short (≤ 16 channels), so n round-trips are
  // fine. Wrapping in a transaction keeps the reorder atomic from the UI's
  // perspective; partial writes would leave a confused order.
  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.orderedIds.length; i++) {
      await tx
        .update(channelDefinitions)
        .set({ ordering: i, updatedAt: new Date() })
        .where(
          and(
            eq(channelDefinitions.id, parsed.orderedIds[i]),
            eq(channelDefinitions.workspaceId, workspace.id),
          ),
        );
    }
  });

  revalidatePath("/settings/channels");
  return { ok: true };
}
