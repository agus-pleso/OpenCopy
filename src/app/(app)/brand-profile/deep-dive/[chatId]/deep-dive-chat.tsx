"use client";

/**
 * Slimmer chat shell for the SEO and Localizer deep-dives. Reuses the same
 * bubble + composer treatment as the onboarding chat — just narrower (no
 * axis sidebar) and a tighter turn budget.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import type {
  BrandProfileChat,
  BrandProfileChatMessage,
} from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LogoMark } from "@/components/marketing/logo";
import { sendDeepDiveTurn } from "@/server/actions/brand-profile";
import { cn } from "@/lib/utils";

interface Props {
  chat: BrandProfileChat;
  initialMessages: BrandProfileChatMessage[];
}

export function DeepDiveChat({ chat, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = React.useState(initialMessages);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [complete, setComplete] = React.useState(chat.status === "completed");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);

    const tempUserMsg: BrandProfileChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: chat.id,
      workspaceId: chat.workspaceId,
      role: "user",
      content: text,
      structuredPatch: null,
      modelId: null,
      provider: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: null,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");

    try {
      const result = await sendDeepDiveTurn({
        chatId: chat.id,
        userMessage: text,
      });

      const tempAssistant: BrandProfileChatMessage = {
        id: `temp-asst-${Date.now()}`,
        chatId: chat.id,
        workspaceId: chat.workspaceId,
        role: "assistant",
        content: result.assistantMessage,
        structuredPatch: null,
        modelId: null,
        provider: null,
        inputTokens: null,
        outputTokens: null,
        durationMs: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, tempAssistant]);
      if (result.complete) setComplete(true);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-[50vh] flex-col overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-6"
      >
        <AnimatePresence initial={false}>
          {messages.map((m, idx) => (
            <Bubble key={m.id} message={m} index={idx} />
          ))}
        </AnimatePresence>
        {sending && <Typing />}
      </div>

      {complete ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-5 py-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--color-success)]" />
          <div className="min-w-0 flex-1">
            <p className="font-display tracking-tight">Deep-dive complete</p>
            <p className="mt-1 text-sm text-pretty text-[var(--color-muted-foreground)]">
              Your answers have been folded into the brand profile.
            </p>
          </div>
          <Button onClick={() => router.push("/brand-profile")} className="gap-1.5">
            <ArrowRight className="h-3.5 w-3.5" /> View profile
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Your answer…"
            disabled={sending}
            className="min-h-[80px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              {chat.turnsRemaining} turn{chat.turnsRemaining === 1 ? "" : "s"} remaining
            </span>
            <Button
              type="button"
              size="sm"
              onClick={onSend}
              disabled={!input.trim() || sending}
              className="gap-1.5"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({
  message,
  index,
}: {
  message: BrandProfileChatMessage;
  index: number;
}) {
  const isUser = message.role === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(index * 0.02, 0.2) }}
      className={cn("flex gap-3 py-4", isUser && "flex-row-reverse")}
    >
      <div className="shrink-0">
        {isUser ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-muted)] text-xs font-medium">
            You
          </span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center">
            <LogoMark className="h-7 w-7" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "max-w-[40rem] text-pretty",
          isUser
            ? "rounded-2xl rounded-tr-sm bg-[var(--color-muted)] px-4 py-2.5 text-[15px] leading-relaxed"
            : "text-[16px] leading-relaxed",
        )}
        style={{ fontFamily: isUser ? undefined : "ui-serif, Georgia, serif" }}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </motion.div>
  );
}

function Typing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-3 py-2"
    >
      <span className="flex h-8 w-8 items-center justify-center">
        <LogoMark className="h-7 w-7" />
      </span>
      <div className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
      </div>
    </motion.div>
  );
}
