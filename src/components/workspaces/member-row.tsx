"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Trash2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  changeMemberRole,
  removeMember,
  type MemberRow as MemberRowData,
} from "@/server/actions/members";
import type { MemberRole } from "@/db/schema";

const ROLE_VARIANT: Record<MemberRole, "default" | "outline" | "muted"> = {
  owner: "default",
  admin: "default",
  editor: "outline",
  viewer: "muted",
};

interface Props {
  member: MemberRowData;
  /** The acting user's role — used to gate role-change UI. */
  actorRole: MemberRole;
}

export function MemberRow({ member, actorRole }: Props) {
  const [pendingRole, startRole] = useTransition();
  const [pendingRemove, startRemove] = useTransition();
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  const canManage = actorRole === "owner" || actorRole === "admin";
  // Only owners can change owner roles or promote to owner.
  const canChangeOwnerRole = actorRole === "owner";
  // Don't allow editing yourself from this UI (use leave workspace).
  const isSelf = member.isCurrentUser;

  const initials = (member.name || member.email)
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const onRoleChange = (next: string) => {
    startRole(async () => {
      try {
        await changeMemberRole({
          memberId: member.memberId,
          role: next as MemberRole,
        });
        toast.success(`Role updated to ${next}.`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const onRemove = () => {
    startRemove(async () => {
      try {
        await removeMember(member.memberId);
        toast.success("Member removed.");
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <li className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-4 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[--color-muted] text-xs font-semibold">
          {initials || "·"}
        </span>
        <div className="min-w-0">
          <p className="font-medium tracking-tight truncate">
            {member.name || member.email.split("@")[0]}
            {isSelf && (
              <span className="ml-2 text-xs text-[--color-muted-foreground]">
                (you)
              </span>
            )}
          </p>
          <p className="text-xs text-[--color-muted-foreground] truncate">
            {member.email}
          </p>
        </div>
        <div className="w-[140px]">
          {canManage && !isSelf ? (
            <Select
              value={member.role}
              onValueChange={onRoleChange}
              disabled={
                pendingRole ||
                (member.role === "owner" && !canChangeOwnerRole)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {canChangeOwnerRole && (
                  <SelectItem value="owner">Owner</SelectItem>
                )}
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge
              variant={ROLE_VARIANT[member.role]}
              className="text-[10px] tracking-wider"
            >
              {member.role}
            </Badge>
          )}
        </div>
        <div>
          {canManage && !isSelf && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={pendingRemove}
                  aria-label="More actions"
                >
                  {pendingRemove ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setConfirmRemove(true)}
                  className="text-[--color-destructive] focus:text-[--color-destructive]"
                >
                  <Trash2 className="h-4 w-4" /> Remove from workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </li>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this member?</DialogTitle>
            <DialogDescription>
              <strong>{member.email}</strong> will lose access immediately.
              Their saved copy stays in the library; the membership row is
              what&apos;s removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onRemove}
              disabled={pendingRemove}
            >
              {pendingRemove && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
