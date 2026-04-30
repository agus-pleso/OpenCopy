"use client";

import * as React from "react";
import { useTransition } from "react";
import { Plus, Loader2, UserPlus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInvitation } from "@/server/actions/invitations";

type InviteRole = "admin" | "editor" | "viewer";

const ROLE_HINTS: Record<InviteRole, string> = {
  admin: "Manages members + provider keys + workspace settings.",
  editor: "Full read/write across voices, agents, documents, library.",
  viewer: "Read-only access.",
};

export function InviteMemberDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<InviteRole>("editor");
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const reset = () => {
    setEmail("");
    setRole("editor");
    setGeneratedUrl(null);
    setCopied(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    startTransition(async () => {
      const res = await createInvitation({ email: email.trim().toLowerCase(), role });
      if (res.ok && res.inviteUrl) {
        setGeneratedUrl(res.inviteUrl);
        toast.success("Invitation created.");
      } else {
        toast.error(res.message ?? "Couldn't create invitation.");
      }
    });
  };

  const onCopy = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success("Link copied — share it with the recipient.");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        {!generatedUrl ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
                <UserPlus className="h-5 w-5" />
              </div>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription>
                Generates a magic link the recipient can use to join. They sign
                in (or sign up) with any email — the invite isn&apos;t locked
                to the address you enter here, just labeled with it.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                required
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[--color-muted-foreground]">
                {ROLE_HINTS[role]}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !email}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Generate link
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-success]/10 text-[--color-success]">
                <Check className="h-5 w-5" />
              </div>
              <DialogTitle>Invitation ready</DialogTitle>
              <DialogDescription>
                Send this link to <strong>{email}</strong>. They&apos;ll join
                as <strong>{role}</strong>. Expires in 7 days.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-muted]/40 p-3">
              <code className="flex-1 truncate font-mono text-xs">
                {generatedUrl}
              </code>
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[11px] text-[--color-muted-foreground] text-pretty">
              Email delivery via Resend lands in V1.7. For now copy + paste the
              link into your existing email / Slack / wherever.
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
