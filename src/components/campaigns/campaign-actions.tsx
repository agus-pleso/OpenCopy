"use client";

import * as React from "react";
import { useTransition } from "react";
import { Trash2, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { deleteCampaign } from "@/server/actions/campaigns";
import { isRedirectError } from "@/lib/utils";

export function CampaignActions({ campaignId }: { campaignId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const onDelete = () => {
    startTransition(async () => {
      try {
        await deleteCampaign(campaignId);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            className="text-[var(--color-destructive)] focus:text-[var(--color-destructive)]"
          >
            <Trash2 className="h-4 w-4" /> Delete campaign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this campaign?</DialogTitle>
            <DialogDescription>
              This permanently removes the campaign, its plan, and every asset.
              Saved assets in your Library aren&apos;t affected. There&apos;s no
              undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Trash2 className="h-3.5 w-3.5" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
