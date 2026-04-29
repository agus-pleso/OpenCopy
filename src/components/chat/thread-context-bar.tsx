"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  ScanText,
  BookOpen,
  Languages,
  Pin,
  PinOff,
  Trash2,
  MoreHorizontal,
  Archive,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import {
  archiveChatThread,
  deleteChatThread,
  updateChatThread,
} from "@/server/actions/chat";
import type { Locale } from "@/db/schema";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

export interface VoiceOption {
  id: string;
  name: string;
  isAnalyzed: boolean;
}

export interface SourceOption {
  id: string;
  name: string;
  status: string;
}

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
  const [voiceId, setVoiceId] = React.useState<string>(initialVoiceId ?? "__none");
  const [locale, setLocale] = React.useState<Locale>(initialLocale);
  const [sourceIds, setSourceIds] = React.useState<string[]>(initialSourceIds);
  const [pinned, setPinned] = React.useState(initialPinned);

  const titleSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const usableVoices = voices.filter((v) => v.isAnalyzed);
  const usableSources = sources.filter((s) => s.status === "ready");

  React.useEffect(() => {
    onContextChange?.({
      voiceId: voiceId !== "__none" ? voiceId : null,
      sourceIds,
      voiceName:
        voiceId !== "__none"
          ? usableVoices.find((v) => v.id === voiceId)?.name ?? null
          : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceId, sourceIds]);

  const onTitleChange = (next: string) => {
    setTitle(next);
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      startMeta(async () => {
        try {
          await updateChatThread({ threadId, title: next.trim() || "New chat" });
        } catch (err) {
          toast.error((err as Error).message);
        }
      });
    }, 700);
  };

  const onVoiceChange = (next: string) => {
    setVoiceId(next);
    startMeta(async () => {
      try {
        await updateChatThread({
          threadId,
          voiceId: next === "__none" ? null : next,
        });
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const onLocaleChange = (next: Locale) => {
    setLocale(next);
    startMeta(async () => {
      try {
        await updateChatThread({ threadId, locale: next });
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const toggleSource = (id: string) => {
    const next = sourceIds.includes(id)
      ? sourceIds.filter((x) => x !== id)
      : [...sourceIds, id];
    setSourceIds(next);
    startMeta(async () => {
      try {
        await updateChatThread({ threadId, sourceIds: next });
      } catch (err) {
        toast.error((err as Error).message);
      }
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
        toast.error((err as Error).message);
      }
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      try {
        await deleteChatThread(threadId);
      } catch (err) {
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
          className="min-w-0 flex-1 bg-transparent font-display text-2xl tracking-tight outline-none focus:bg-[--color-muted]/30 rounded px-1 -mx-1"
          maxLength={220}
        />
        <div className="flex items-center gap-2">
          {pendingMeta && (
            <span className="text-[11px] text-[--color-muted-foreground]">
              <Loader2 className="inline h-3 w-3 animate-spin" />
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePinned}
            aria-label={pinned ? "Unpin" : "Pin"}
            className={pinned ? "text-[--color-primary]" : ""}
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
                className="text-[--color-destructive] focus:text-[--color-destructive]"
              >
                <Trash2 className="h-4 w-4" /> Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex items-center gap-1.5 text-[--color-muted-foreground]">
          <ScanText className="h-3.5 w-3.5" />
          <Select value={voiceId} onValueChange={onVoiceChange}>
            <SelectTrigger className="h-7 w-[170px] border-none bg-transparent px-1 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No voice</SelectItem>
              {usableVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[--color-muted-foreground]">
          <Languages className="h-3.5 w-3.5" />
          <Select
            value={locale}
            onValueChange={(v) => onLocaleChange(v as Locale)}
          >
            <SelectTrigger className="h-7 w-[120px] border-none bg-transparent px-1 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {usableSources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-[--color-muted-foreground]" />
            {usableSources.map((s) => {
              const selected = sourceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSource(s.id)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                    selected
                      ? "border-[--color-primary]/40 bg-[--color-primary]/10 text-[--color-primary]"
                      : "border-[--color-border] bg-[--color-background] text-[--color-foreground] hover:bg-[--color-accent]",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
        {sourceIds.length > 0 && (
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {sourceIds.length} active
          </Badge>
        )}
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
