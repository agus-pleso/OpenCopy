"use client";

import * as React from "react";
import {
  Copy,
  User,
  Sparkles,
  Check,
  Loader2,
  Wrench,
  AlertCircle,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/marketing/logo";
import { saveChatMessageToLibrary } from "@/server/actions/library";

export interface ChatToolInvocation {
  toolCallId: string;
  toolName: string;
  state: "partial-call" | "call" | "result";
  result?: unknown;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId?: string | null;
  durationMs?: number | null;
  retrievedSourceIds?: string[] | null;
  toolInvocations?: ChatToolInvocation[];
}

const TOOL_LABELS: Record<string, string> = {
  list_brand_voices: "Listing voices",
  get_brand_voice: "Reading voice",
  update_brand_voice: "Updating voice",
  list_recent_variants: "Listing variants",
  rewrite_copy_variant: "Rewriting variant",
  localize_text: "Localizing copy",
};

interface Props {
  message: ChatMessageView;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: Props) {
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  if (message.role === "system") return null; // never render system

  const onCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success("Copied.");
    setTimeout(() => setCopied(false), 1500);
  };

  const onSaveToLibrary = async () => {
    setSaving(true);
    try {
      await saveChatMessageToLibrary({ messageId: message.id });
      setJustSaved(true);
      toast.success("Saved to library.");
      setTimeout(() => setJustSaved(false), 1800);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "group flex gap-4 py-5",
        isUser && "flex-row-reverse text-right",
      )}
    >
      <div className="shrink-0">
        {isUser ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)]">
            <User className="h-4 w-4" />
          </span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center">
            <LogoMark className="h-7 w-7" />
          </span>
        )}
      </div>

      <div className={cn("min-w-0 flex-1", isUser && "flex flex-col items-end")}>
        {!isUser && message.toolInvocations && message.toolInvocations.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {message.toolInvocations.map((inv) => (
              <ToolInvocationPill key={inv.toolCallId} invocation={inv} />
            ))}
          </div>
        )}

        <div
          className={cn(
            "inline-block max-w-[88ch] text-pretty",
            isUser
              ? "rounded-2xl rounded-tr-sm bg-[var(--color-muted)] px-4 py-2.5 text-[15px] leading-relaxed text-left"
              : "text-[15px] leading-relaxed",
          )}
          style={{
            fontFamily: isUser ? undefined : "ui-serif, Georgia, serif",
          }}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <article className="prose prose-neutral max-w-none prose-headings:font-display prose-headings:tracking-tight prose-p:my-3 prose-ul:my-3 prose-li:my-1 prose-strong:text-[var(--color-foreground)] prose-code:bg-[var(--color-muted)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-pre:bg-[var(--color-muted)]/50 prose-pre:rounded-lg prose-blockquote:border-l-2 prose-blockquote:border-[var(--color-primary)] prose-blockquote:bg-[var(--color-muted)]/30 prose-blockquote:not-italic prose-blockquote:py-1 prose-a:text-[var(--color-primary)] prose-a:underline-offset-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-[var(--color-primary)]/70 ml-0.5" />
              )}
            </article>
          )}
        </div>

        {!isUser && !isStreaming && message.content.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={onCopy}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-[11px]",
                justSaved && "text-[var(--color-success)]",
              )}
              onClick={onSaveToLibrary}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : justSaved ? (
                <BookmarkCheck className="h-3 w-3" />
              ) : (
                <Bookmark className="h-3 w-3" />
              )}
              {justSaved ? "Saved" : "Save"}
            </Button>
            {message.modelId && (
              <span className="font-mono">{message.modelId}</span>
            )}
            {message.durationMs != null && (
              <span className="tabular-nums">
                {(message.durationMs / 1000).toFixed(1)}s
              </span>
            )}
            {message.retrievedSourceIds &&
              message.retrievedSourceIds.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[var(--color-primary)]">
                  <Sparkles className="h-3 w-3" />
                  {message.retrievedSourceIds.length} source
                  {message.retrievedSourceIds.length === 1 ? "" : "s"}
                </span>
              )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ToolInvocationPill({ invocation }: { invocation: ChatToolInvocation }) {
  const label = TOOL_LABELS[invocation.toolName] ?? invocation.toolName;
  const isPending = invocation.state !== "result";
  const result = invocation.result as { error?: string; ok?: boolean; message?: string } | undefined;
  const hasError = !!result?.error;

  return (
    <div
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-md border px-2.5 py-1 text-[12px]",
        hasError
          ? "border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 text-[var(--color-destructive)]"
          : isPending
          ? "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          : "border-[var(--color-success)]/30 bg-[var(--color-success)]/5 text-[var(--color-success)]",
      )}
    >
      {hasError ? (
        <AlertCircle className="h-3.5 w-3.5" />
      ) : isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Wrench className="h-3.5 w-3.5" />
      )}
      <span className="font-medium tracking-tight">{label}</span>
      {!isPending && result?.message && (
        <span className="text-[var(--color-muted-foreground)]">
          {" · "}
          {result.message}
        </span>
      )}
      {hasError && (
        <span className="text-[var(--color-destructive)]/80">
          {" · "}
          {result?.error}
        </span>
      )}
    </div>
  );
}
