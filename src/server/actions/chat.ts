"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  chatMessages,
  chatThreads,
  type ChatThread,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);

/* ----------------------------------------------------------------------------
 * Threads                                                                    */
/* -------------------------------------------------------------------------- */

const CreateSchema = z.object({
  title: z.string().min(1).max(220).optional(),
  voiceId: z.string().uuid().optional(),
  locale: LocaleEnum.default("en"),
  systemPrompt: z.string().max(4000).optional(),
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
  modelId: z.string().max(120).optional(),
});

export async function createChatThread(input: unknown): Promise<{ id: string }> {
  const parsed = CreateSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const [thread] = await db
    .insert(chatThreads)
    .values({
      workspaceId: workspace.id,
      title: parsed.title ?? "New chat",
      voiceId: parsed.voiceId ?? null,
      locale: parsed.locale,
      systemPrompt: parsed.systemPrompt ?? null,
      sourceIds: parsed.sourceIds ?? [],
      modelId: parsed.modelId ?? null,
      createdByUserId: userId,
    })
    .returning({ id: chatThreads.id });

  revalidatePath("/chat");
  return { id: thread.id };
}

const UpdateSchema = z.object({
  threadId: z.string().uuid(),
  title: z.string().min(1).max(220).optional(),
  voiceId: z.string().uuid().nullable().optional(),
  locale: LocaleEnum.optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
  modelId: z.string().max(120).nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function updateChatThread(input: unknown): Promise<void> {
  const parsed = UpdateSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const updates: Partial<typeof chatThreads.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.voiceId !== undefined) updates.voiceId = parsed.voiceId;
  if (parsed.locale !== undefined) updates.locale = parsed.locale;
  if (parsed.systemPrompt !== undefined) updates.systemPrompt = parsed.systemPrompt;
  if (parsed.sourceIds !== undefined) updates.sourceIds = parsed.sourceIds;
  if (parsed.modelId !== undefined) updates.modelId = parsed.modelId;
  if (parsed.pinned !== undefined) updates.pinned = parsed.pinned;

  await db
    .update(chatThreads)
    .set(updates)
    .where(
      and(
        eq(chatThreads.id, parsed.threadId),
        eq(chatThreads.workspaceId, workspace.id),
      ),
    );

  revalidatePath(`/chat/${parsed.threadId}`);
  revalidatePath("/chat");
}

export async function archiveChatThread(threadId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(chatThreads)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(chatThreads.id, threadId),
        eq(chatThreads.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/chat");
}

export async function unarchiveChatThread(threadId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .update(chatThreads)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(chatThreads.id, threadId),
        eq(chatThreads.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/chat");
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .delete(chatThreads)
    .where(
      and(
        eq(chatThreads.id, threadId),
        eq(chatThreads.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/chat");
  redirect("/chat");
}

/* ----------------------------------------------------------------------------
 * Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface ThreadListItem extends ChatThread {
  lastMessagePreview: string | null;
  messageCount: number;
}

export async function listChatThreads(opts?: {
  includeArchived?: boolean;
}): Promise<ThreadListItem[]> {
  const { workspace } = await getCurrentWorkspace();
  const rows = await db.query.chatThreads.findMany({
    where: eq(chatThreads.workspaceId, workspace.id),
    orderBy: [desc(chatThreads.pinned), desc(chatThreads.updatedAt)],
    with: {
      messages: {
        orderBy: [desc(chatMessages.createdAt)],
        limit: 1,
        columns: { content: true, role: true },
      },
    },
  });

  // Filter archived in JS so we still get count.
  const filtered = opts?.includeArchived
    ? rows
    : rows.filter((r) => !r.archivedAt);

  return filtered.map((r) => {
    const last = r.messages?.[0];
    return {
      ...r,
      lastMessagePreview: last
        ? `${last.role === "user" ? "You: " : ""}${last.content.slice(0, 140)}`
        : null,
      messageCount: r.messages?.length ?? 0,
    };
  });
}

export async function getChatThread(threadId: string) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.chatThreads.findFirst({
    where: and(
      eq(chatThreads.id, threadId),
      eq(chatThreads.workspaceId, workspace.id),
    ),
    with: {
      voice: { columns: { id: true, name: true, defaultLocale: true } },
      messages: { orderBy: [asc(chatMessages.createdAt)] },
    },
  });
}
