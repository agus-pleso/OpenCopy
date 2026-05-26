"use client";

import * as React from "react";
import Link from "next/link";
import { useTransition } from "react";
import { Trash2, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { isRedirectError } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ExportButton } from "@/components/exports/export-button";
import {
  ComposeContextBar,
  type ComposeContextValue,
  type ComposeVoiceOption,
} from "@/components/compose/compose-context-bar";
import {
  AutosaveIndicator,
  type SaveState,
} from "./autosave-indicator";
import {
  deleteDocument,
  updateDocument,
} from "@/server/actions/documents";
import type { Document } from "@/db/schema";

interface Props {
  document: Document;
  voices: ComposeVoiceOption[];
}

export function DocumentShell({ document, voices }: Props) {
  const [pendingMeta, startMetaTransition] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [title, setTitle] = React.useState(document.title);
  const [compose, setCompose] = React.useState<ComposeContextValue>({
    voiceId: document.voiceId,
    locale: document.locale,
    sourceIds: [],
  });
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
          if (isRedirectError(err)) throw err;
          toast.error((err as Error).message);
        }
      });
    }, 800);
  };

  // The bar emits the full new compose value; persist only the deltas so we
  // keep the existing per-field auto-save semantics + toast on voice change.
  const onComposeChange = (next: ComposeContextValue) => {
    setCompose((prev) => {
      const patch: {
        documentId: string;
        voiceId?: string | null;
        locale?: typeof prev.locale;
      } = { documentId: document.id };
      let voiceChanged = false;
      if (next.voiceId !== prev.voiceId) {
        patch.voiceId = next.voiceId;
        voiceChanged = true;
      }
      if (next.locale !== prev.locale) patch.locale = next.locale;
      if (Object.keys(patch).length > 1) {
        startMetaTransition(async () => {
          try {
            await updateDocument(patch);
            if (voiceChanged) toast.success("Voice updated.");
          } catch (err) {
            if (isRedirectError(err)) throw err;
            toast.error((err as Error).message);
          }
        });
      }
      return next;
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      try {
        await deleteDocument(document.id);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10 md:py-12">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <AutosaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/audit/${document.id}`}>
              <Search className="h-3.5 w-3.5" /> Audit SEO
            </Link>
          </Button>
          <ExportButton kind="document" id={document.id} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                className="text-[var(--color-destructive)] focus:text-[var(--color-destructive)]"
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
          <ComposeContextBar
            variant="inline"
            value={compose}
            onChange={onComposeChange}
            voices={voices}
            hideSources
            tourPrefix="documents"
          />
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

      <p className="mt-12 text-xs text-[var(--color-muted-foreground)]">
        Type <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 font-mono text-[10px]">/</kbd>{" "}
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
