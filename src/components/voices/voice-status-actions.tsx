"use client";

import * as React from "react";
import { useTransition } from "react";
import { Archive, ArchiveRestore, Trash2, MoreHorizontal, CheckCircle2 } from "lucide-react";
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
import { setVoiceStatus, deleteVoice } from "@/server/actions/voices";
import type { VoiceStatus } from "@/db/schema";

interface Props {
  voiceId: string;
  status: VoiceStatus;
  hasAnalysis: boolean;
}

export function VoiceStatusActions({ voiceId, status, hasAnalysis }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const update = (next: VoiceStatus) => {
    startTransition(async () => {
      try {
        await setVoiceStatus({ voiceId, status: next });
        toast.success(
          next === "active"
            ? "Voice activated."
            : next === "archived"
            ? "Voice archived."
            : "Set to draft.",
        );
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      try {
        await deleteVoice(voiceId);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {status === "draft" && hasAnalysis && (
          <Button
            variant="default"
            size="sm"
            onClick={() => update("active")}
            disabled={pending}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Activate voice
          </Button>
        )}
        {status === "archived" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => update("active")}
            disabled={pending}
          >
            <ArchiveRestore className="h-3.5 w-3.5" /> Restore
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {status !== "active" && hasAnalysis && (
              <DropdownMenuItem onClick={() => update("active")}>
                <CheckCircle2 className="h-4 w-4" /> Mark active
              </DropdownMenuItem>
            )}
            {status !== "draft" && (
              <DropdownMenuItem onClick={() => update("draft")}>
                Set to draft
              </DropdownMenuItem>
            )}
            {status !== "archived" && (
              <DropdownMenuItem onClick={() => update("archived")}>
                <Archive className="h-4 w-4" /> Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="text-[--color-destructive] focus:text-[--color-destructive]"
            >
              <Trash2 className="h-4 w-4" /> Delete voice…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this voice?</DialogTitle>
            <DialogDescription>
              This permanently removes the voice profile, all writing samples,
              and the audit history. There&apos;s no undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
