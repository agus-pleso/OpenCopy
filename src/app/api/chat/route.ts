import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { db } from "@/db/client";
import {
  brandVoices,
  chatMessages,
  chatThreads,
  type ChatRole,
} from "@/db/schema";
import { getCurrentWorkspace, requireRole } from "@/lib/auth/workspace";
import { resolveModel } from "@/lib/ai/providers";
import { searchKnowledge, formatKnowledgeForPrompt } from "@/lib/kb/search";
import {
  buildChatSystemPrompt,
  deriveTitleFromMessage,
} from "@/lib/agents/chat/system-prompt";
import { buildChatTools } from "@/lib/agents/chat/tools";
import type { VoiceCardForPrompt } from "@/lib/agents/voice-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v6 wire format: DefaultChatTransport sends a body with `messages: UIMessage[]`
// plus an `id`, `trigger`, and whatever custom fields we configure (here:
// `threadId`). Permissive schema so transport-injected extras don't fail us.
const UIMessagePartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(UIMessagePartSchema),
});

const RequestSchema = z
  .object({
    threadId: z.string().uuid(),
    messages: z.array(UIMessageSchema),
  })
  .passthrough();

/** Concatenate the text parts of a UIMessage. Ignores tool/data parts. */
function getMessageText(m: {
  parts: Array<{ type: string; text?: string }>;
}): string {
  return m.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  let workspaceId: string;
  let userId: string;
  try {
    const { workspace } = await getCurrentWorkspace();
    await requireRole(workspace.id, "editor");
    workspaceId = workspace.id;
    const session = await import("@/lib/auth/auth").then((m) => m.auth());
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    userId = session.user.id;
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 401 },
    );
  }

  const thread = await db.query.chatThreads.findFirst({
    where: and(
      eq(chatThreads.id, parsed.data.threadId),
      eq(chatThreads.workspaceId, workspaceId),
    ),
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const incoming = parsed.data.messages;
  const lastUser = [...incoming].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json(
      { error: "No user message in payload" },
      { status: 400 },
    );
  }
  const lastUserText = getMessageText(lastUser);

  // Persist the user message we haven't seen yet. To dedupe, fetch existing
  // message count and only insert if the count of user messages in the
  // payload exceeds what's stored.
  const existingMessages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.threadId, thread.id),
    orderBy: [asc(chatMessages.createdAt)],
    columns: { id: true, role: true, content: true },
  });
  const incomingUserCount = incoming.filter((m) => m.role === "user").length;
  const existingUserCount = existingMessages.filter(
    (m) => m.role === "user",
  ).length;

  if (incomingUserCount > existingUserCount) {
    await db.insert(chatMessages).values({
      threadId: thread.id,
      workspaceId,
      role: "user",
      content: lastUserText,
    });
    if (existingMessages.length === 0) {
      await db
        .update(chatThreads)
        .set({
          title: deriveTitleFromMessage(lastUserText),
          updatedAt: new Date(),
        })
        .where(eq(chatThreads.id, thread.id));
    } else {
      await db
        .update(chatThreads)
        .set({ updatedAt: new Date() })
        .where(eq(chatThreads.id, thread.id));
    }
  }

  // Optional voice
  let voiceCard: VoiceCardForPrompt | undefined;
  if (thread.voiceId) {
    const voice = await db.query.brandVoices.findFirst({
      where: eq(brandVoices.id, thread.voiceId),
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

  // Optional KB retrieval per-turn — query against the latest user message text.
  let knowledge: string | undefined;
  let retrievedSourceIds: string[] = [];
  if (thread.sourceIds && thread.sourceIds.length > 0) {
    try {
      const hits = await searchKnowledge(lastUserText, {
        workspaceId,
        sourceIds: thread.sourceIds,
        topK: 6,
      });
      if (hits.length > 0) {
        knowledge = formatKnowledgeForPrompt(hits);
        retrievedSourceIds = Array.from(new Set(hits.map((h) => h.source.id)));
      }
    } catch (err) {
      console.warn("[chat] knowledge retrieval failed:", err);
    }
  }

  const system = buildChatSystemPrompt({
    voice: voiceCard,
    customSystemPrompt: thread.systemPrompt,
    knowledge,
    locale: thread.locale,
  });

  // Resolve model. Thread can override via thread.modelId; else fall back to
  // the workspace's drafting role default (good chat tradeoff for cost/quality).
  const { model, modelId, provider } = await resolveModel({
    workspaceId,
    role: "drafting",
    modelId: thread.modelId ?? undefined,
  });

  // v6: convert UIMessage parts → ModelMessage shape that streamText expects.
  // convertToModelMessages is async in v6 — it may resolve tool/file parts.
  const modelMessages = await convertToModelMessages(incoming as UIMessage[]);

  const start = Date.now();

  const tools = buildChatTools({
    workspaceId,
    userId,
    attachedVoiceId: thread.voiceId,
    defaultLocale: thread.locale,
  });

  try {
    const result = streamText({
      model,
      system,
      messages: modelMessages,
      tools,
      // Allow up to a few sequential tool calls per turn so the model can
      // read-then-write (e.g. get_brand_voice → update_brand_voice).
      stopWhen: stepCountIs(5),
      temperature: 0.7,
      onFinish: async ({ text, usage, finishReason }) => {
        if (finishReason === "error") return;
        try {
          await db.insert(chatMessages).values({
            threadId: thread.id,
            workspaceId,
            role: "assistant" as ChatRole,
            content: text,
            modelId,
            provider,
            retrievedSourceIds,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            durationMs: Date.now() - start,
          });
          await db
            .update(chatThreads)
            .set({ updatedAt: new Date() })
            .where(eq(chatThreads.id, thread.id));
        } catch (err) {
          console.error("[chat] failed to persist assistant message:", err);
        }
      },
    });

    void userId; // userId is captured for future telemetry / created_by_user_id columns

    return result.toUIMessageStreamResponse();
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
