"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Pin,
  PinOff,
  Trash2,
  MoreHorizontal,
  Archive,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ComposeContextBar,
  type ComposeContextValue,
  type ComposeVoiceOption,
  type ComposeSourceOption,
} from "@/components/compose/compose-context-bar";
import { isRedirectError } from "@/lib/utils";
import {
  archiveChatThread,
  deleteChatThread,
  updateChatThread,
} from "@/server/actions/chat";
import type { Locale } from "@/db/schema";

export type VoiceOption = ComposeVoiceOption;
export type SourceOption = ComposeSourceOption;

interface Props {
  threadId: string;
  title: string;
  voiceId: string | null;
  locale: Locale;
  sourceIds: string[];
  pinned: boolean;
  voices: VoiceOption[];
  sources: SourceOption[];
  onContextChange?: (next: {
    voiceId: string | null;
    sourceIds: string[];
    voiceName: string | null;
  }) => void;
}

export function ThreadContextBar({
  threadId,
  title: initialTitle,
  voiceId: initialVoiceId,
  locale: initialLocale,
  sourceIds: initialSourceIds,
  pinned: initialPinned,
  voices,
  sources,
  onContextChange,
}: Props) {
  const [pendingMeta, startMeta] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const [title, setTitle] = React.useState(initialTitle);
  const [compose, setCompose] = React.useState<ComposeContextValue>({
    voiceId: initialVoiceId,
    locale: initialLocale,
    sourceIds: initialSourceIds,
  });
  const [pinned, setPinned] = React.useState(initialPinned);

  const titleSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const usableVoices = voices.filter((v) => v.isAnalyzed);

  const onTitleChange = (next: string) => {
    setTitle(next);
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      startMeta(async () => {
        try {
          await updateChatThread({ threadId, title: next.trim() || "New chat" });
        } catch (err) {
          if (isRedirectError(err)) throw err;
          toast.error((err as Error).message);
        }
      });
    }, 700);
  };

  // The bar emits the full new ComposeContextValue on every interaction.
  // We diff against the previous state to figure out what to persist —
  // the server action accepts each field independently so we only send the
  // delta. That keeps the existing per-field auto-save semantics intact.
  const onComposeChange = (next: ComposeContextValue) => {
    setCompose((prev) => {
      const patch: {
        threadId: string;
        voiceId?: string | null;
        locale?: Locale;
        sourceIds?: string[];
      } = { threadId };
      if (next.voiceId !== prev.voiceId) patch.voiceId = next.voiceId;
      if (next.locale !== prev.locale) patch.locale = next.locale;
      if (
        next.sourceIds.length !== prev.sourceIds.length ||
        next.sourceIds.some((id, i) => id !== prev.sourceIds[i])
      ) {
        patch.sourceIds = next.sourceIds;
      }
      if (Object.keys(patch).length > 1) {
        startMeta(async () => {
          try {
            await updateChatThread(patch);
          } catch (err) {
            if (isRedirectError(err)) throw err;
            toast.error((err as Error).message);
          }
        });
      }
      return next;
    });
    onContextChange?.({
      voiceId: next.voiceId,
      sourceIds: next.sourceIds,
      voiceName: next.voiceId
        ? usableVoices.find((v) => v.id === next.voiceId)?.name ?? null
        : null,
    });
  };

  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);
    startMeta(async () => {
      try {
        await updateChatThread({ threadId, pinned: next });
        toast.success(next ? "Pinned." : "Unpinned.");
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  const onArchive = () => {
    startMeta(async () => {
      try {
        await archiveChatThread(threadId);
        toast.success("Archived.");
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      try {
        await deleteChatThread(threadId);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-display text-2xl tracking-tight outline-none focus:bg-[var(--color-muted)]/30 rounded px-1 -mx-1"
          maxLength={220}
        />
        <div className="flex items-center gap-2">
          {pendingMeta && (
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              <Loader2 className="inline h-3 w-3 animate-spin" />
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePinned}
            aria-label={pinned ? "Unpin" : "Pin"}
            className={pinned ? "text-[var(--color-primary)]" : ""}
          >
            {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onArchive}>
                <Archive className="h-4 w-4" /> Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                className="text-[var(--color-destructive)] focus:text-[var(--color-destructive)]"
              >
                <Trash2 className="h-4 w-4" /> Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3">
        <ComposeContextBar
          variant="inline"
          value={compose}
          onChange={onComposeChange}
          voices={voices}
          sources={sources}
          tourPrefix="chat"
        />
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this chat?</DialogTitle>
            <DialogDescription>
              This permanently removes the thread and every message. There&apos;s
              no undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={pendingDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
