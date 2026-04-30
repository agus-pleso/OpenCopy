"use client";

import * as React from "react";
import { useTransition } from "react";
import { RefreshCw, Trash2, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isRedirectError } from "@/lib/utils";

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
  reindexKnowledgeSource,
  deleteKnowledgeSource,
} from "@/server/actions/knowledge";

interface Props {
  sourceId: string;
}

export function SourceActions({ sourceId }: Props) {
  const [pendingReindex, startReindex] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const onReindex = () => {
    startReindex(async () => {
      const res = await reindexKnowledgeSource(sourceId);
      if (res.ok) toast.success("Reindexed.");
      else toast.error(res.message ?? "Reindex failed.");
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      try {
        await deleteKnowledgeSource(sourceId);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReindex}
          disabled={pendingReindex}
        >
          {pendingReindex ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Reindex
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="text-[var(--color-destructive)] focus:text-[var(--color-destructive)]"
            >
              <Trash2 className="h-4 w-4" /> Delete source
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this source?</DialogTitle>
            <DialogDescription>
              This permanently removes the source and every chunk + embedding it
              produced. There&apos;s no undo.
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
