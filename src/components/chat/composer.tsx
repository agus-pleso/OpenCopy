"use client";

import * as React from "react";
import { Send, Square, ScanText, BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  voiceName?: string | null;
  sourceCount?: number;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  voiceName,
  sourceCount = 0,
}: Props) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 240);
    ta.style.height = `${next}px`;
  }, [value]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isStreaming && value.trim().length > 0) onSubmit();
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.06)]">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        rows={1}
        placeholder="Ask anything — brainstorm angles, draft copy, refine, translate."
        className={cn(
          "block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-muted-foreground)]",
          "min-h-[52px]",
        )}
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      />
      <div className="flex items-center gap-3 border-t border-[var(--color-border)]/60 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          {voiceName && (
            <span className="inline-flex items-center gap-1.5">
              <ScanText className="h-3 w-3 text-[var(--color-primary)]" />
              <span>{voiceName}</span>
            </span>
          )}
          {sourceCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 text-[var(--color-primary)]" />
              <span className="tabular-nums">
                {sourceCount} source{sourceCount === 1 ? "" : "s"}
              </span>
            </span>
          )}
          {!voiceName && sourceCount === 0 && (
            <span>No voice or sources attached — chat is free-form.</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <kbd className="hidden sm:inline rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">
            ⏎ to send · ⇧⏎ for newline
          </kbd>
          {isStreaming ? (
            <Button size="sm" variant="outline" onClick={onStop}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={disabled || value.trim().length === 0}
            >
              {disabled ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
