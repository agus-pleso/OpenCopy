"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Building2 } from "lucide-react";
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
import { createWorkspace } from "@/server/actions/workspaces";
import type { Locale } from "@/db/schema";

interface Props {
  trigger?: React.ReactNode;
}

export function NewWorkspaceDialog({ trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = React.useState("");
  const [defaultLocale, setDefaultLocale] = React.useState<Locale>("en");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    startTransition(async () => {
      try {
        await createWorkspace({ name: name.trim(), defaultLocale });
        setOpen(false);
        setName("");
        toast.success("Workspace created.");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Plus className="h-4 w-4" /> New workspace
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
              <Building2 className="h-5 w-5" />
            </div>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A separate workspace for a different team, brand, or project. You
              become the owner immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              autoFocus
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Acme Marketing — Q4 launch"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Default locale</Label>
            <Select
              value={defaultLocale}
              onValueChange={(v) => setDefaultLocale(v as Locale)}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
