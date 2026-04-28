"use client";

import * as React from "react";
import {
  Sparkles,
  PenLine,
  Repeat,
  ChevronsLeftRight,
  ChevronsRightLeft,
  MessageSquareMore,
  Wand2,
  Sparkle,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  PenLine,
  Repeat,
  ChevronsLeftRight,
  ChevronsRightLeft,
  MessageSquareMore,
  Wand2,
  Sparkle,
  Check,
};

export interface SlashMenuItem {
  command: string;
  label: string;
  hint: string;
  icon: string;
  needsSelection: boolean;
  needsPrompt: boolean;
}

export interface SlashMenuProps {
  items: SlashMenuItem[];
  query: string;
  /** Whether a command is currently being prompted (awaiting user input) or running. */
  promptFor?: SlashMenuItem | null;
  running?: boolean;
  rect: DOMRect | null;
  onSelect: (item: SlashMenuItem) => void;
  onPromptSubmit?: (text: string) => void;
  onPromptCancel?: () => void;
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashMenu = React.forwardRef<SlashMenuRef, SlashMenuProps>(
  function SlashMenu(props, ref) {
    const {
      items,
      query,
      promptFor,
      running,
      rect,
      onSelect,
      onPromptSubmit,
      onPromptCancel,
    } = props;
    const [selectedIdx, setSelectedIdx] = React.useState(0);
    const [promptText, setPromptText] = React.useState("");
    const promptInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
      setSelectedIdx(0);
    }, [query]);

    React.useEffect(() => {
      if (promptFor && promptInputRef.current) {
        promptInputRef.current.focus();
      }
    }, [promptFor]);

    React.useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (promptFor || running) return false;
        if (event.key === "ArrowDown") {
          setSelectedIdx((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelectedIdx((i) =>
            items.length === 0 ? 0 : (i + items.length - 1) % items.length,
          );
          return true;
        }
        if (event.key === "Enter") {
          if (items[selectedIdx]) {
            onSelect(items[selectedIdx]);
          }
          return true;
        }
        return false;
      },
    }));

    if (!rect) return null;

    const style: React.CSSProperties = {
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      zIndex: 60,
    };

    return (
      <div
        style={style}
        className="w-[320px] overflow-hidden rounded-lg border border-[--color-border] bg-[--color-popover] text-[--color-popover-foreground] shadow-2xl"
      >
        {promptFor ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (promptText.trim()) onPromptSubmit?.(promptText.trim());
            }}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 border-b border-[--color-border] px-3 py-2">
              <Wand2 className="h-3.5 w-3.5 text-[--color-primary]" />
              <p className="text-xs uppercase tracking-wider text-[--color-muted-foreground]">
                {promptFor.label}
              </p>
            </div>
            <input
              ref={promptInputRef}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onPromptCancel?.();
                }
              }}
              placeholder={
                promptFor.command === "compose"
                  ? "Describe what to write…"
                  : promptFor.command === "change-tone"
                  ? "e.g. wittier, more direct, warmer"
                  : "What should it do?"
              }
              className="bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[--color-muted-foreground]"
            />
            <div className="flex items-center justify-between border-t border-[--color-border] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[--color-muted-foreground]">
              <span>Enter to run · Esc to cancel</span>
              {running && (
                <span className="inline-flex items-center gap-1 text-[--color-primary]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Running
                </span>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className="border-b border-[--color-border] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[--color-muted-foreground]">
              {running ? (
                <span className="inline-flex items-center gap-1.5 text-[--color-primary]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Running command…
                </span>
              ) : items.length > 0 ? (
                <>{items.length} command{items.length === 1 ? "" : "s"}</>
              ) : (
                "No matches"
              )}
            </div>
            <ul className="max-h-[280px] overflow-y-auto p-1">
              {items.map((item, i) => {
                const Icon = ICONS[item.icon] ?? Sparkles;
                const active = i === selectedIdx;
                return (
                  <li key={item.command}>
                    <button
                      type="button"
                      onMouseEnter={() => setSelectedIdx(i)}
                      onClick={() => onSelect(item)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition",
                        active && "bg-[--color-accent] text-[--color-accent-foreground]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                          active
                            ? "bg-[--color-primary] text-[--color-primary-foreground]"
                            : "bg-[--color-muted] text-[--color-muted-foreground]",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium tracking-tight">
                          {item.label}
                        </span>
                        <span className="block text-xs text-[--color-muted-foreground] truncate">
                          {item.hint}
                        </span>
                      </span>
                      {item.needsSelection && (
                        <span className="shrink-0 text-[9px] uppercase tracking-wider text-[--color-muted-foreground]">
                          select
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    );
  },
);
