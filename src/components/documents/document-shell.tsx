"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Trash2,
  ScanText,
  MoreHorizontal,
  Languages,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DocumentEditor } from "@/components/editor/editor";
import {
  AutosaveIndicator,
  type SaveState,
} from "./autosave-indicator";
import {
  deleteDocument,
  updateDocument,
} from "@/server/actions/documents";
import type { Document, Locale } from "@/db/schema";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

interface VoiceOption {
  id: string;
  name: string;
  isAnalyzed: boolean;
}

interface Props {
  document: Document;
  voices: VoiceOption[];
}

export function DocumentShell({ document, voices }: Props) {
  const router = useRouter();
  const [pendingMeta, startMetaTransition] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [title, setTitle] = React.useState(document.title);
  const [voiceId, setVoiceId] = React.useState<string>(
    document.voiceId ?? "__none",
  );
  const [locale, setLocale] = React.useState<Locale>(document.locale);
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(
    document.updatedAt,
  );

  const titleSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const onTitleChange = (next: string) => {
    setTitle(next);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => {
      startMetaTransition(async () => {
        try {
          await updateDocument({ documentId: document.id, title: next });
        } catch (err) {
          toast.error((err as Error).message);
        }
      });
    }, 800);
  };

  const onVoiceChange = (next: string) => {
    setVoiceId(next);
    startMetaTransition(async () => {
      try {
        await updateDocument({
          documentId: document.id,
          voiceId: next === "__none" ? null : next,
        });
        toast.success("Voice updated.");
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const onLocaleChange = (next: Locale) => {
    setLocale(next);
    startMetaTransition(async () => {
      try {
        await updateDocument({ documentId: document.id, locale: next });
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      try {
        await deleteDocument(document.id);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const usableVoices = voices.filter((v) => v.isAnalyzed);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10 md:py-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[--color-muted-foreground] hover:text-[--color-foreground] transition"
        >
          <ChevronLeft className="h-3 w-3" /> Documents
        </Link>
        <div className="flex items-center gap-3">
          <AutosaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                className="text-[--color-destructive] focus:text-[--color-destructive]"
              >
                <Trash2 className="h-4 w-4" /> Delete document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Title + meta */}
      <div className="mt-6">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          className="h-auto border-none bg-transparent px-0 font-display text-4xl tracking-tight shadow-none focus-visible:ring-0 md:text-5xl"
          maxLength={220}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex items-center gap-1.5 text-[--color-muted-foreground]">
            <ScanText className="h-3.5 w-3.5" />
            <Select value={voiceId} onValueChange={onVoiceChange}>
              <SelectTrigger className="h-7 w-[180px] border-none bg-transparent px-1 text-xs shadow-none">
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
            <Select value={locale} onValueChange={(v) => onLocaleChange(v as Locale)}>
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
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {pendingMeta ? "syncing" : document.status}
          </Badge>
        </div>
      </div>

      {/* Editor */}
      <div className="mt-8">
        <DocumentEditor
          documentId={document.id}
          initialHtml={document.contentHtml}
          onSave={({ savingState, lastSavedAt }) => {
            setSaveState(savingState);
            if (lastSavedAt) setLastSavedAt(lastSavedAt);
          }}
        />
      </div>

      <p className="mt-12 text-xs text-[--color-muted-foreground]">
        Type <kbd className="rounded border border-[--color-border] bg-[--color-muted] px-1 py-0.5 font-mono text-[10px]">/</kbd>{" "}
        to invoke an inline AI command. Highlight text to see the bubble menu.
      </p>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>
              This permanently removes the document. There&apos;s no undo.
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
    </div>
  );
}
