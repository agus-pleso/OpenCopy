"use client";

import * as React from "react";
import { useChat, type Message } from "@ai-sdk/react";
import { toast } from "sonner";

import { ChatMessage, type ChatMessageView } from "./message";
import { ChatComposer } from "./composer";
import {
  ThreadContextBar,
  type VoiceOption,
  type SourceOption,
} from "./thread-context-bar";
import type { ChatMessage as DbChatMessage, Locale } from "@/db/schema";

interface Props {
  threadId: string;
  title: string;
  voiceId: string | null;
  voiceName: string | null;
  locale: Locale;
  sourceIds: string[];
  pinned: boolean;
  initialMessages: DbChatMessage[];
  voices: VoiceOption[];
  sources: SourceOption[];
}

export function ChatShell({
  threadId,
  title,
  voiceId: initialVoiceId,
  voiceName: initialVoiceName,
  locale,
  sourceIds: initialSourceIds,
  pinned,
  initialMessages,
  voices,
  sources,
}: Props) {
  const [voiceName, setVoiceName] = React.useState<string | null>(initialVoiceName);
  const [activeSourceIds, setActiveSourceIds] =
    React.useState<string[]>(initialSourceIds);

  const seeded: Message[] = initialMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const { messages, input, setInput, append, status, stop } = useChat({
    api: "/api/chat",
    id: threadId,
    body: { threadId },
    initialMessages: seeded,
    onError: (err) => {
      toast.error(err.message || "Chat request failed.");
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const onSubmit = () => {
    if (!input.trim() || isStreaming) return;
    void append({ role: "user", content: input.trim() });
    setInput("");
  };

  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming]);

  // Map AI SDK messages to our view shape, threading per-message metadata
  // from the DB seed when ids match.
  const dbMetaById = React.useMemo(() => {
    const m = new Map<string, DbChatMessage>();
    initialMessages.forEach((msg) => m.set(msg.id, msg));
    return m;
  }, [initialMessages]);

  const renderMessages: ChatMessageView[] = messages.map((m) => {
    const dbMeta = dbMetaById.get(m.id);
    return {
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      modelId: dbMeta?.modelId ?? null,
      durationMs: dbMeta?.durationMs ?? null,
      retrievedSourceIds: dbMeta?.retrievedSourceIds ?? null,
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-[--color-border] px-6 py-4 md:px-10">
        <ThreadContextBar
          threadId={threadId}
          title={title}
          voiceId={initialVoiceId}
          locale={locale}
          sourceIds={initialSourceIds}
          pinned={pinned}
          voices={voices}
          sources={sources}
          onContextChange={(ctx) => {
            setVoiceName(ctx.voiceName);
            setActiveSourceIds(ctx.sourceIds);
          }}
        />
      </header>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 md:px-10"
      >
        <div className="mx-auto w-full max-w-3xl">
          {renderMessages.length === 0 && (
            <div className="flex h-full min-h-[40vh] items-center justify-center">
              <div className="text-center">
                <p className="font-display text-2xl tracking-tight">
                  How can I help with your copy?
                </p>
                <p className="mt-2 text-sm text-[--color-muted-foreground] text-pretty max-w-md mx-auto">
                  Ask for angles, draft a section, refine a paragraph, translate
                  to PL · RO · UA. With a brand voice attached, every reply
                  honors it.
                </p>
              </div>
            </div>
          )}
          {renderMessages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              isStreaming={
                isStreaming &&
                i === renderMessages.length - 1 &&
                m.role === "assistant"
              }
            />
          ))}
          <div className="h-6" />
        </div>
      </div>

      <div className="border-t border-[--color-border] px-6 pb-6 pt-4 md:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={onSubmit}
            onStop={stop}
            isStreaming={isStreaming}
            voiceName={voiceName}
            sourceCount={activeSourceIds.length}
          />
        </div>
      </div>
    </div>
  );
}
