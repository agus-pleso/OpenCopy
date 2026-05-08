"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  brandVoices,
  documents,
  type Document,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";
import { runTextAgent } from "@/lib/agents/core";
import {
  editorCommandAgent,
  type EditorCommand,
  type EditorCommandInput,
} from "@/lib/agents/editor/commands";
import type { VoiceCardForPrompt } from "@/lib/agents/voice-card";

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);

/* ----------------------------------------------------------------------------
 * Document CRUD                                                              */
/* -------------------------------------------------------------------------- */

const CreateSchema = z.object({
  title: z.string().min(1).max(220).default("Untitled"),
  voiceId: z.string().uuid().optional(),
  locale: LocaleEnum.default("en"),
});

export async function createDocument(input: unknown): Promise<{ id: string }> {
  const parsed = CreateSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  if (parsed.voiceId) {
    const voice = await db.query.brandVoices.findFirst({
      where: and(
        eq(brandVoices.id, parsed.voiceId),
        eq(brandVoices.workspaceId, workspace.id),
      ),
    });
    if (!voice) throw new Error("VOICE_NOT_FOUND");
  }

  const [doc] = await db
    .insert(documents)
    .values({
      workspaceId: workspace.id,
      title: parsed.title,
      voiceId: parsed.voiceId ?? null,
      locale: parsed.locale,
      createdByUserId: userId,
    })
    .returning({ id: documents.id });

  revalidatePath("/documents");
  return { id: doc.id };
}

const UpdateSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(220).optional(),
  contentHtml: z.string().max(500_000).optional(),
  contentText: z.string().max(500_000).optional(),
  wordCount: z.number().int().min(0).max(1_000_000).optional(),
  voiceId: z.string().uuid().nullable().optional(),
  locale: LocaleEnum.optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export async function updateDocument(input: unknown): Promise<{ savedAt: Date }> {
  const parsed = UpdateSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  const updates: Partial<typeof documents.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.contentHtml !== undefined) updates.contentHtml = parsed.contentHtml;
  if (parsed.contentText !== undefined) updates.contentText = parsed.contentText;
  if (parsed.wordCount !== undefined) updates.wordCount = parsed.wordCount;
  if (parsed.voiceId !== undefined) updates.voiceId = parsed.voiceId;
  if (parsed.locale !== undefined) updates.locale = parsed.locale;
  if (parsed.status !== undefined) updates.status = parsed.status;

  await db
    .update(documents)
    .set(updates)
    .where(
      and(
        eq(documents.id, parsed.documentId),
        eq(documents.workspaceId, workspace.id),
      ),
    );

  return { savedAt: new Date() };
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  await db
    .delete(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/documents");
  redirect("/documents");
}

export async function listDocuments(): Promise<
  Array<Document & { voice?: { id: string; name: string } | null }>
> {
  const { workspace } = await getCurrentWorkspace();
  const rows = await db.query.documents.findMany({
    where: eq(documents.workspaceId, workspace.id),
    orderBy: [desc(documents.updatedAt)],
    with: {
      voice: { columns: { id: true, name: true } },
    },
  });
  return rows;
}

export async function getDocument(documentId: string) {
  const { workspace } = await getCurrentWorkspace();
  return db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.workspaceId, workspace.id),
    ),
    with: { voice: true },
  });
}

/* ----------------------------------------------------------------------------
 * Inline AI commands                                                         */
/* -------------------------------------------------------------------------- */

const RunCommandSchema = z.object({
  documentId: z.string().uuid(),
  command: z.enum([
    "compose",
    "continue",
    "rephrase",
    "shorten",
    "expand",
    "explain",
    "change-tone",
    "improve",
    "fix-grammar",
    "make-shorter",
    "make-longer",
  ]) satisfies z.ZodType<EditorCommand>,
  documentContent: z.string().max(80_000).default(""),
  target: z.string().max(8000).default(""),
  before: z.string().max(2000).optional(),
  after: z.string().max(2000).optional(),
  prompt: z.string().max(500).optional(),
});

export interface EditorCommandResult {
  ok: boolean;
  text?: string;
  durationMs?: number;
  modelId?: string;
  message?: string;
}

export async function runEditorCommand(
  input: unknown,
): Promise<EditorCommandResult> {
  const parsed = RunCommandSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const doc = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, parsed.documentId),
      eq(documents.workspaceId, workspace.id),
    ),
  });
  if (!doc) return { ok: false, message: "Document not found." };

  let voiceCard: VoiceCardForPrompt | undefined;
  if (doc.voiceId) {
    const voice = await db.query.brandVoices.findFirst({
      where: eq(brandVoices.id, doc.voiceId),
    });
    if (voice) {
      voiceCard = {
        name: voice.name,
        toneDescriptors: voice.toneDescriptors,
        voicePersona: voice.voicePersona,
        audience: voice.audience,
        readingLevel: voice.readingLevel,
        dos: voice.dos,
        donts: voice.donts,
        requiredWords: voice.requiredWords,
        forbiddenWords: voice.forbiddenWords,
        signaturePhrases: voice.signaturePhrases,
        localeNotes: voice.localeNotes,
      };
    }
  }

  const agentInput: EditorCommandInput = {
    command: parsed.command,
    voice: voiceCard,
    documentContent: parsed.documentContent,
    target: parsed.target,
    before: parsed.before,
    after: parsed.after,
    prompt: parsed.prompt,
  };

  try {
    const result = await runTextAgent(editorCommandAgent, agentInput, {
      workspaceId: workspace.id,
      userId,
    });
    return {
      ok: true,
      text: result.text,
      durationMs: result.durationMs,
      modelId: result.modelId,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
