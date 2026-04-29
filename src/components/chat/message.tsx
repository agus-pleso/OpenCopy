"use client";

import * as React from "react";
import { Copy, User, Sparkles, Check } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/marketing/logo";

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId?: string | null;
  durationMs?: number | null;
  retrievedSourceIds?: string[] | null;
}

interface Props {
  message: ChatMessageView;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: Props) {
  const [copied, setCopied] = React.useState(false);

  if (message.role === "system") return null; // never render system

  const onCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success("Copied.");
    setTimeout(() => setCopied(false), 1500);
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
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[--color-border] bg-[--color-muted] text-[--color-foreground]">
            <User className="h-4 w-4" />
          </span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center">
            <LogoMark className="h-7 w-7" />
          </span>
        )}
      </div>

      <div className={cn("min-w-0 flex-1", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "inline-block max-w-[88ch] text-pretty",
            isUser
              ? "rounded-2xl rounded-tr-sm bg-[--color-muted] px-4 py-2.5 text-[15px] leading-relaxed text-left"
              : "text-[15px] leading-relaxed",
          )}
          style={{
            fontFamily: isUser ? undefined : "ui-serif, Georgia, serif",
          }}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <article className="prose prose-neutral max-w-none prose-headings:font-display prose-headings:tracking-tight prose-p:my-3 prose-ul:my-3 prose-li:my-1 prose-strong:text-[--color-foreground] prose-code:bg-[--color-muted] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-pre:bg-[--color-muted]/50 prose-pre:rounded-lg prose-blockquote:border-l-2 prose-blockquote:border-[--color-primary] prose-blockquote:bg-[--color-muted]/30 prose-blockquote:not-italic prose-blockquote:py-1 prose-a:text-[--color-primary] prose-a:underline-offset-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-[--color-primary]/70 ml-0.5" />
              )}
            </article>
          )}
        </div>

        {!isUser && !isStreaming && message.content.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[--color-muted-foreground] opacity-0 transition-opacity group-hover:opacity-100">
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
                <span className="inline-flex items-center gap-1 text-[--color-primary]">
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
