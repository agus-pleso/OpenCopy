"use client";

/**
 * nl-command-inline — the "Update brand" input that sits on the brand profile
 * page. Identical wire to the palette version, just inline instead of a Dialog.
 *
 * Auto-applies the diff per V1 spec (no preview gate). Shows the diff briefly
 * after success via toast so the marketer sees what changed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runNlCommand } from "@/server/actions/brand-profile";

interface Props {
  className?: string;
}

const EXAMPLES = [
  "make the Polish voice more formal",
  "add a competitor: BetterHelp",
  "add audience: Solo founders",
];

export function NlCommandInline({ className }: Props) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const command = value.trim();
    if (!command) return;
    startTransition(async () => {
      try {
        const res = await runNlCommand({ command });
        if (res.applied) {
          toast.success(res.summary);
          setValue("");
          router.refresh();
        } else {
          toast.warning(res.summary);
        }
      } catch (err) {
        toast.error((err as Error).message || "Couldn't apply.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          Update brand in plain English
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. add a competitor: BetterHelp"
            disabled={pending}
            className="flex-1"
          />
          <Button type="submit" disabled={!value.trim() || pending} className="gap-1.5">
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Apply
          </Button>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted-foreground)]">
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setValue(ex)}
              className="rounded-full bg-[var(--color-muted)]/60 px-2 py-0.5 transition hover:bg-[var(--color-muted)]"
            >
              {ex}
            </button>
          ))}
        </p>
      </div>
    </form>
  );
}
