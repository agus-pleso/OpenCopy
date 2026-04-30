"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { switchWorkspace } from "@/server/actions/workspaces";
import { NewWorkspaceDialog } from "./new-workspace-dialog";
import type { MyWorkspaceRow } from "@/server/actions/workspaces";

interface Props {
  current: { id: string; name: string };
  workspaces: MyWorkspaceRow[];
}

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onSwitch = (id: string) => {
    if (id === current.id) return;
    startTransition(async () => {
      try {
        await switchWorkspace(id);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-background)]/40 px-2.5 py-2 text-sm transition hover:bg-[var(--color-sidebar-accent)]"
          >
            <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="truncate font-medium flex-1 text-left">
              {current.name}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[240px]"
          sideOffset={4}
        >
          <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onClick={() => onSwitch(w.id)}
              disabled={pending}
              className="flex items-center gap-2"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-primary)]/10 text-[10px] font-semibold uppercase text-[var(--color-primary)]">
                {w.name.slice(0, 1)}
              </span>
              <span className="flex-1 truncate">
                <span className="block truncate font-medium tracking-tight">
                  {w.name}
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {w.role} · {w.memberCount} member
                  {w.memberCount === 1 ? "" : "s"}
                </span>
              </span>
              {w.isCurrent && (
                <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <NewWorkspaceDialog
            trigger={
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-[var(--color-accent)]"
              >
                <Plus className="h-4 w-4" /> New workspace
              </button>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Hidden marker for sidebar workspace count; useful for tests. */}
      <span data-workspaces-count={workspaces.length} hidden />
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      {pending && <span hidden>{Badge.toString()}</span>}
    </>
  );
}
