"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Sparkle,
  Repeat,
  Check,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Loader2,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";

import { runEditorCommand } from "@/server/actions/documents";
import type { EditorCommand } from "@/lib/agents/editor/commands";
import { cn } from "@/lib/utils";

interface Props {
  editor: Editor;
  documentId: string;
}

const ACTIONS: Array<{
  command: EditorCommand;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { command: "improve", label: "Improve", icon: Sparkle },
  { command: "rephrase", label: "Rephrase", icon: Repeat },
  { command: "fix-grammar", label: "Fix grammar", icon: Check },
  { command: "make-shorter", label: "Shorter", icon: ChevronsLeftRight },
  { command: "make-longer", label: "Longer", icon: ChevronsRightLeft },
];

export function BubbleActions({ editor, documentId }: Props) {
  const [pending, startTransition] = useTransition();
  const [activeCommand, setActiveCommand] = React.useState<EditorCommand | null>(
    null,
  );

  const runCommand = (command: EditorCommand) => {
    const { from, to } = editor.state.selection;
    if (from === to) {
      toast.error("Select some text first.");
      return;
    }
    const target = editor.state.doc.textBetween(from, to, "\n");
    if (target.trim().length < 2) {
      toast.error("Select more text — at least a couple words.");
      return;
    }
    setActiveCommand(command);
    startTransition(async () => {
      try {
        const documentContent = editor.getText();
        const res = await runEditorCommand({
          documentId,
          command,
          documentContent,
          target,
        });
        if (!res.ok || !res.text) {
          toast.error(res.message ?? "Command failed.");
          return;
        }
        editor.chain().focus().deleteRange({ from, to }).insertContent(res.text).run();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setActiveCommand(null);
      }
    });
  };

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[--color-border] bg-[--color-popover] p-1 shadow-xl">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        const isActive = activeCommand === a.command;
        return (
          <button
            key={a.command}
            type="button"
            onClick={() => runCommand(a.command)}
            disabled={pending}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
              "hover:bg-[--color-accent] disabled:pointer-events-none disabled:opacity-50",
              isActive && "bg-[--color-primary]/10 text-[--color-primary]",
            )}
          >
            {isActive ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
