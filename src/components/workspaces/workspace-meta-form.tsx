"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Save, AlertTriangle, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isRedirectError } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateWorkspace,
  leaveWorkspace,
  deleteCurrentWorkspace,
} from "@/server/actions/workspaces";
import type { Locale, MemberRole } from "@/db/schema";

interface Props {
  workspace: { id: string; name: string; slug: string; defaultLocale: Locale };
  role: MemberRole;
}

export function WorkspaceMetaForm({ workspace, role }: Props) {
  const [pending, startMeta] = useTransition();
  const [pendingLeave, startLeave] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [name, setName] = React.useState(workspace.name);
  const [defaultLocale, setDefaultLocale] = React.useState<Locale>(
    workspace.defaultLocale,
  );
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteVerify, setDeleteVerify] = React.useState("");

  const canManage = role === "owner" || role === "admin";
  const canDelete = role === "owner";

  const dirty = name.trim() !== workspace.name || defaultLocale !== workspace.defaultLocale;

  const onSave = () => {
    startMeta(async () => {
      try {
        await updateWorkspace({
          workspaceId: workspace.id,
          name: name.trim(),
          defaultLocale,
        });
        toast.success("Workspace updated.");
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  const onLeave = () => {
    startLeave(async () => {
      try {
        await leaveWorkspace(workspace.id);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      try {
        await deleteCurrentWorkspace();
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-name">Name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-slug">Slug</Label>
          <Input
            id="ws-slug"
            value={workspace.slug}
            disabled
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Slug stays stable for the lifetime of the workspace.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 md:max-w-xs">
        <Label>Default locale</Label>
        <Select
          value={defaultLocale}
          onValueChange={(v) => setDefaultLocale(v as Locale)}
          disabled={!canManage}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="pl">Polski</SelectItem>
            <SelectItem value="ro">Română</SelectItem>
            <SelectItem value="uk">Українська</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending || !dirty}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save changes
          </Button>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-destructive)]" />
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-destructive)]">
            Danger zone
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3">
            <div>
              <p className="font-medium tracking-tight">Leave workspace</p>
              <p className="text-xs text-[var(--color-muted-foreground)] text-pretty">
                Remove yourself from this workspace. Your saved copy stays;
                you lose access to voices, knowledge, agents, etc.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmLeave(true)}
              disabled={pendingLeave}
            >
              <LogOut className="h-3.5 w-3.5" /> Leave
            </Button>
          </div>
          {canDelete && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-3">
              <div>
                <p className="font-medium tracking-tight text-[var(--color-destructive)]">
                  Delete workspace
                </p>
                <p className="text-xs text-[var(--color-destructive)]/80 text-pretty">
                  Permanently removes the workspace and EVERYTHING in it —
                  voices, sources, agents, runs, documents, threads, library.
                  No undo.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={pendingDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this workspace?</DialogTitle>
            <DialogDescription>
              You&apos;ll lose access to {workspace.name} immediately. If
              you&apos;re the last owner, you&apos;ll need to promote another
              member to owner first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onLeave}
              disabled={pendingLeave}
            >
              {pendingLeave && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Leave workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) setDeleteVerify("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workspace permanently?</DialogTitle>
            <DialogDescription>
              Type <strong>{workspace.name}</strong> to confirm. Every voice,
              knowledge source, agent run, document, chat thread, campaign, and
              library variant will be deleted. There is no undo.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteVerify}
            onChange={(e) => setDeleteVerify(e.target.value)}
            placeholder={workspace.name}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={pendingDelete || deleteVerify !== workspace.name}
            >
              {pendingDelete && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Trash2 className="h-3.5 w-3.5" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
