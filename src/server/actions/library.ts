"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  chatMessages,
  chatThreads,
  copyVariants,
  documents,
  libraryEntries,
  type CopywriterBrief,
  type LibraryEntry,
  type LibraryEntryKind,
  type Locale,
  type LocalizerBrief,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";

/* ----------------------------------------------------------------------------
 * Unified DTO — what the Library page renders.
 * Saved copy variants live in `copy_variants` (status='saved'); chat-message
 * and document-selection saves live in `library_entries`. The page projects
 * both into this single discriminated-union shape.
 * -------------------------------------------------------------------------- */

export type LibraryItemKind = "variant" | "chat_message" | "document_selection";

export interface LibraryVariantItem {
  kind: "variant";
  id: string;
  variantId: string;
  content: string;
  refinedContent: string | null;
  locale: Locale;
  label: string | null;
  auditScore: number | null;
  runId: string;
  runKind: "copywriter" | "localizer";
  runBrief: CopywriterBrief | LocalizerBrief | null;
  voice: { id: string; name: string } | null;
  savedAt: Date;
  createdAt: Date;
}

export interface LibraryChatMessageItem {
  kind: "chat_message";
  id: string;
  entryId: string;
  content: string;
  title: string | null;
  locale: Locale;
  tags: string[];
  voice: { id: string; name: string } | null;
  chatThreadId: string | null;
  chatMessageId: string | null;
  savedAt: Date;
}

export interface LibraryDocumentSelectionItem {
  kind: "document_selection";
  id: string;
  entryId: string;
  content: string;
  title: string | null;
  locale: Locale;
  tags: string[];
  voice: { id: string; name: string } | null;
  documentId: string | null;
  documentTitle: string | null;
  selectionAnchor: { from: number; to: number } | null;
  savedAt: Date;
}

export type LibraryItem =
  | LibraryVariantItem
  | LibraryChatMessageItem
  | LibraryDocumentSelectionItem;

/* ----------------------------------------------------------------------------
 * Read — unified list                                                        */
/* -------------------------------------------------------------------------- */

export async function listLibrary(filter?: {
  voiceId?: string;
  locale?: Locale;
  kinds?: LibraryItemKind[];
}): Promise<LibraryItem[]> {
  const { workspace } = await getCurrentWorkspace();

  const wantsVariants = !filter?.kinds || filter.kinds.includes("variant");
  const wantsChat = !filter?.kinds || filter.kinds.includes("chat_message");
  const wantsDoc =
    !filter?.kinds || filter.kinds.includes("document_selection");

  // ---- copy variants (status = saved) ----
  const variantRows = wantsVariants
    ? await (async () => {
        const conds = [
          eq(copyVariants.workspaceId, workspace.id),
          eq(copyVariants.status, "saved" as const),
        ];
        if (filter?.voiceId) conds.push(eq(copyVariants.voiceId, filter.voiceId));
        if (filter?.locale) conds.push(eq(copyVariants.locale, filter.locale));
        return db.query.copyVariants.findMany({
          where: and(...conds),
          orderBy: [desc(copyVariants.savedAt), desc(copyVariants.createdAt)],
          limit: 200,
          with: {
            voice: { columns: { id: true, name: true } },
            run: { columns: { id: true, kind: true, brief: true } },
          },
        });
      })()
    : [];

  // ---- library_entries (chat / doc selection) ----
  const entryKinds: LibraryEntryKind[] = [];
  if (wantsChat) entryKinds.push("chat_message");
  if (wantsDoc) entryKinds.push("document_selection");

  const entryRows = entryKinds.length
    ? await (async () => {
        const conds = [
          eq(libraryEntries.workspaceId, workspace.id),
          inArray(libraryEntries.kind, entryKinds),
        ];
        if (filter?.voiceId) conds.push(eq(libraryEntries.voiceId, filter.voiceId));
        if (filter?.locale) conds.push(eq(libraryEntries.locale, filter.locale));
        return db.query.libraryEntries.findMany({
          where: and(...conds),
          orderBy: [desc(libraryEntries.createdAt)],
          limit: 200,
          with: {
            voice: { columns: { id: true, name: true } },
            document: { columns: { id: true, title: true } },
          },
        });
      })()
    : [];

  // ---- project into the union ----
  const items: LibraryItem[] = [];

  for (const v of variantRows) {
    if (!v.run) continue; // run was deleted; skip orphan
    items.push({
      kind: "variant",
      id: `variant:${v.id}`,
      variantId: v.id,
      content: v.content,
      refinedContent: v.refinedContent,
      locale: v.locale,
      label: v.label,
      auditScore: v.refinedScore ?? v.auditScore,
      runId: v.runId,
      runKind: v.run.kind,
      runBrief: (v.run.brief as CopywriterBrief | LocalizerBrief | null) ?? null,
      voice: v.voice,
      savedAt: v.savedAt ?? v.createdAt,
      createdAt: v.createdAt,
    });
  }

  for (const e of entryRows) {
    if (e.kind === "chat_message") {
      items.push({
        kind: "chat_message",
        id: `entry:${e.id}`,
        entryId: e.id,
        content: e.content,
        title: e.title,
        locale: e.locale,
        tags: e.tags,
        voice: e.voice,
        chatThreadId: e.chatThreadId,
        chatMessageId: e.chatMessageId,
        savedAt: e.createdAt,
      });
    } else if (e.kind === "document_selection") {
      items.push({
        kind: "document_selection",
        id: `entry:${e.id}`,
        entryId: e.id,
        content: e.content,
        title: e.title,
        locale: e.locale,
        tags: e.tags,
        voice: e.voice,
        documentId: e.documentId,
        documentTitle: e.document?.title ?? null,
        selectionAnchor: e.selectionAnchor,
        savedAt: e.createdAt,
      });
    }
  }

  items.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  return items;
}

/* ----------------------------------------------------------------------------
 * Save — chat message                                                        */
/* -------------------------------------------------------------------------- */

const SaveChatMessageSchema = z.object({
  messageId: z.string().uuid(),
  title: z.string().max(220).optional(),
});

export async function saveChatMessageToLibrary(
  input: unknown,
): Promise<{ entryId: string }> {
  const parsed = SaveChatMessageSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const message = await db.query.chatMessages.findFirst({
    where: and(
      eq(chatMessages.id, parsed.messageId),
      eq(chatMessages.workspaceId, workspace.id),
    ),
    with: {
      thread: {
        columns: { id: true, voiceId: true, locale: true },
      },
    },
  });
  if (!message) {
    throw new Error("Chat message not found");
  }

  const [row] = await db
    .insert(libraryEntries)
    .values({
      workspaceId: workspace.id,
      kind: "chat_message",
      content: message.content,
      title: parsed.title ?? null,
      voiceId: message.thread?.voiceId ?? null,
      locale: message.thread?.locale ?? "en",
      chatMessageId: message.id,
      chatThreadId: message.threadId,
      savedByUserId: userId,
    })
    .returning({ id: libraryEntries.id });

  revalidatePath("/library");
  return { entryId: row.id };
}

/* ----------------------------------------------------------------------------
 * Save — document selection                                                  */
/* -------------------------------------------------------------------------- */

const SaveDocumentSelectionSchema = z.object({
  documentId: z.string().uuid(),
  content: z.string().min(1).max(20000),
  title: z.string().max(220).optional(),
  selectionAnchor: z
    .object({
      from: z.number().int().min(0),
      to: z.number().int().min(0),
    })
    .optional(),
});

export async function saveDocumentSelectionToLibrary(
  input: unknown,
): Promise<{ entryId: string }> {
  const parsed = SaveDocumentSelectionSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const doc = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, parsed.documentId),
      eq(documents.workspaceId, workspace.id),
    ),
    columns: { id: true, voiceId: true, locale: true, title: true },
  });
  if (!doc) {
    throw new Error("Document not found");
  }

  const [row] = await db
    .insert(libraryEntries)
    .values({
      workspaceId: workspace.id,
      kind: "document_selection",
      content: parsed.content,
      title: parsed.title ?? doc.title,
      voiceId: doc.voiceId,
      locale: doc.locale,
      documentId: doc.id,
      selectionAnchor: parsed.selectionAnchor ?? null,
      savedByUserId: userId,
    })
    .returning({ id: libraryEntries.id });

  revalidatePath("/library");
  return { entryId: row.id };
}

/* ----------------------------------------------------------------------------
 * Delete — single + bulk                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteLibraryEntry(entryId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .delete(libraryEntries)
    .where(
      and(
        eq(libraryEntries.id, entryId),
        eq(libraryEntries.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/library");
}

const BulkDeleteSchema = z.object({
  variantIds: z.array(z.string().uuid()).max(200).default([]),
  entryIds: z.array(z.string().uuid()).max(200).default([]),
});

export async function bulkDeleteLibraryItems(input: unknown): Promise<{
  variantsDiscarded: number;
  entriesDeleted: number;
}> {
  const parsed = BulkDeleteSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  let variantsDiscarded = 0;
  let entriesDeleted = 0;

  if (parsed.variantIds.length) {
    const result = await db
      .update(copyVariants)
      .set({ status: "discarded" })
      .where(
        and(
          inArray(copyVariants.id, parsed.variantIds),
          eq(copyVariants.workspaceId, workspace.id),
        ),
      )
      .returning({ id: copyVariants.id });
    variantsDiscarded = result.length;
  }

  if (parsed.entryIds.length) {
    const result = await db
      .delete(libraryEntries)
      .where(
        and(
          inArray(libraryEntries.id, parsed.entryIds),
          eq(libraryEntries.workspaceId, workspace.id),
        ),
      )
      .returning({ id: libraryEntries.id });
    entriesDeleted = result.length;
  }

  revalidatePath("/library");
  return { variantsDiscarded, entriesDeleted };
}

export type { LibraryEntry };
