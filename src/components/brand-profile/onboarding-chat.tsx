"use client";

/**
 * onboarding-chat — streaming-feel transcript with axis sidebar.
 *
 * Sidebar tracks the 4 axes (voice / knowledge / audience / positioning) plus
 * a turn counter and a progress bar. The chat reveal-animation runs every
 * time a new assistant message lands so the marketer feels the AI "thinking".
 * "Add samples" affordance pops a mini dialog where the marketer can paste
 * 3-5 sample pieces tagged by locale — optional and skippable per V1 spec.
 *
 * The actual server-action call (`sendOnboardingTurn`) returns the next
 * canned question synchronously; we just simulate the typing rhythm so the
 * first-run UX has the "alive AI" texture without paying for streaming
 * infrastructure that Worktree A will wire up later.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Plus,
  Loader2,
  CheckCircle2,
  CircleDot,
  Circle,
  Sparkles,
  X,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

import type {
  BrandProfileChat,
  BrandProfileChatMessage,
  Locale,
} from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoMark } from "@/components/marketing/logo";
import {
  completeOnboarding,
  sendOnboardingTurn,
} from "@/server/actions/brand-profile";
import { cn } from "@/lib/utils";

const AXES = [
  { id: "voice", label: "Voice", hint: "How you sound." },
  { id: "audience", label: "Audience", hint: "Who you speak to." },
  { id: "positioning", label: "Positioning", hint: "How you differ." },
  { id: "knowledge", label: "Knowledge", hint: "Product facts + offerings." },
] as const;

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

interface PastedSample {
  id: string;
  content: string;
  locale: Locale;
}

interface Props {
  chat: BrandProfileChat;
  initialMessages: BrandProfileChatMessage[];
  totalTurnBudget: number;
}

export function OnboardingChat({
  chat,
  initialMessages,
  totalTurnBudget,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = React.useState(initialMessages);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [turnsRemaining, setTurnsRemaining] = React.useState(chat.turnsRemaining);
  const [currentAxis, setCurrentAxis] = React.useState(chat.axis ?? "voice");
  const [samples, setSamples] = React.useState<PastedSample[]>([]);
  const [samplesOpen, setSamplesOpen] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Auto-scroll to the most recent message.
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const turnsUsed = totalTurnBudget - turnsRemaining;
  const progress = totalTurnBudget === 0 ? 0 : turnsUsed / totalTurnBudget;
  const done = turnsRemaining <= 0;

  const onSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);

    // Optimistic insert of the user turn so the UX feels immediate. The
    // server-action's persisted row replaces it on next refresh — for now
    // we just leave the temp id in place; tsc-clean.
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
      const result = await sendOnboardingTurn({
        chatId: chat.id,
        userMessage: text,
        pastedSamples:
          samples.length > 0
            ? samples.map((s) => ({ content: s.content, locale: s.locale }))
            : undefined,
      });

      const tempAssistantMsg: BrandProfileChatMessage = {
        id: `temp-asst-${Date.now()}`,
        chatId: chat.id,
        workspaceId: chat.workspaceId,
        role: "assistant",
        content: result.assistantMessage,
        structuredPatch: result.structuredPatch ?? null,
        modelId: null,
        provider: null,
        inputTokens: null,
        outputTokens: null,
        durationMs: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, tempAssistantMsg]);
      setTurnsRemaining(result.turnsRemaining);
      setCurrentAxis(result.axisNext);
      if (samples.length > 0) {
        toast.success(`Captured ${samples.length} sample piece${samples.length === 1 ? "" : "s"}.`);
        setSamples([]);
      }
    } catch (err) {
      toast.error((err as Error).message || "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  const onComplete = async () => {
    setCompleting(true);
    try {
      await completeOnboarding(chat.id);
      toast.success("Brand profile saved.");
      router.push("/brand-profile");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save.");
      setCompleting(false);
    }
  };

  return (
    <div className="grid w-full gap-8 lg:grid-cols-[1fr_280px]">
      {/* Transcript */}
      <div className="flex min-h-[60vh] flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-6"
        >
          <AnimatePresence initial={false}>
            {messages.map((m, idx) => (
              <ChatBubble key={m.id} message={m} index={idx} />
            ))}
          </AnimatePresence>
          {sending && <TypingIndicator />}
        </div>

        {/* Sample chip rail */}
        {samples.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              Samples queued
            </span>
            {samples.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)]"
              >
                {LOCALE_LABEL[s.locale]} · {s.content.length} chars
                <button
                  type="button"
                  onClick={() => setSamples((p) => p.filter((q) => q.id !== s.id))}
                  className="rounded-full hover:bg-[var(--color-primary)]/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Composer */}
        {!done ? (
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
              className="min-h-[90px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSamplesOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add samples
                <span className="text-[var(--color-muted-foreground)]">optional</span>
              </Button>
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
                <span className="hidden sm:inline">Cmd+Enter to send</span>
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
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-5 py-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--color-success)]" />
              <div className="min-w-0 flex-1">
                <p className="font-display tracking-tight">Ready to wrap up</p>
                <p className="mt-1 text-sm text-pretty text-[var(--color-muted-foreground)]">
                  I&apos;ve captured your brand profile. Save it to start using your
                  voice across every agent.
                </p>
              </div>
              <Button onClick={onComplete} disabled={completing} className="gap-1.5">
                {completing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Save & continue
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Onboarding
          </p>
          <p className="mt-1 font-display text-2xl tracking-tight">
            {turnsUsed}
            <span className="text-base text-[var(--color-muted-foreground)]"> / {totalTurnBudget} turns</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full bg-[var(--color-primary)]"
            />
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            I&apos;ll ask 15-25 questions to capture your voice, audience, positioning,
            and product knowledge. Skip with a one-word answer if a question doesn&apos;t fit.
          </p>
        </div>

        <ul className="mt-4 space-y-1">
          {AXES.map((a) => {
            const active = a.id === currentAxis;
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                  active && "bg-[var(--color-primary)]/8 text-[var(--color-foreground)]",
                )}
              >
                {active ? (
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                )}
                <div>
                  <p
                    className={cn(
                      "font-medium tracking-tight",
                      active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]",
                    )}
                  >
                    {a.label}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{a.hint}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <SamplesDialog
        open={samplesOpen}
        onOpenChange={setSamplesOpen}
        onAdd={(s) => setSamples((p) => [...p, s])}
      />
    </div>
  );
}

function ChatBubble({
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
          "max-w-[42rem] text-pretty",
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

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
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

function SamplesDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sample: PastedSample) => void;
}) {
  const [content, setContent] = React.useState("");
  const [locale, setLocale] = React.useState<Locale>("en");

  const reset = () => {
    setContent("");
    setLocale("en");
  };

  const handleAdd = () => {
    const trimmed = content.trim();
    if (trimmed.length < 20) {
      toast.error("Paste at least a paragraph (~20 chars).");
      return;
    }
    onAdd({ id: crypto.randomUUID(), content: trimmed, locale });
    toast.success("Sample queued. It'll be analyzed on your next turn.");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a writing sample</DialogTitle>
          <DialogDescription>
            Paste 3-5 paragraphs from a recent email, hero section, or landing page.
            I&apos;ll fold these into your voice analysis. Optional — skip if you&apos;d rather
            just talk.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">Locale</span>
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pl">Polski</SelectItem>
                <SelectItem value="ro">Română</SelectItem>
                <SelectItem value="uk">Українська</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste sample copy…"
            className="min-h-[160px]"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd}>Queue sample</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
