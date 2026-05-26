"use client";

/**
 * nl-command-palette — Cmd+Shift+K floating palette that runs natural-language
 * commands against the brand profile.
 *
 * Note: the existing global Cmd+K palette is the navigation/search palette
 * (see src/components/shell/command-palette.tsx). We use **Cmd+Shift+K** (or
 * Ctrl+Shift+K on Windows) as the brand-profile NL shortcut so the two don't
 * collide. The Cmd+K palette will surface a "Open brand-profile palette"
 * entry as a discoverability hook.
 *
 * Auto-applies the diff per V1 spec — no preview gate. Diff returned by the
 * action shows in a toast so the marketer sees what changed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runNlCommand } from "@/server/actions/brand-profile";

const EXAMPLES = [
  "make the Polish voice more formal",
  "make the English voice less formal",
  "add a competitor: BetterHelp",
  "add audience: Solo founders",
];

export function NlCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd+Shift+K (mac) or Ctrl+Shift+K (Windows/Linux). The Shift modifier
      // is what separates this from the global Cmd+K navigation palette.
      if (
        (e.key === "k" || e.key === "K") &&
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
            Update brand in plain English
          </DialogTitle>
          <DialogDescription>
            Tell me what to change — I&apos;ll apply it directly and save a revision
            you can roll back from.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. make the Polish voice more formal"
              disabled={pending}
              className="flex-1"
            />
            <Button type="submit" disabled={!value.trim() || pending} className="gap-1.5">
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              Apply
            </Button>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              Examples
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setValue(ex)}
                  className="rounded-full bg-[var(--color-muted)]/60 px-2.5 py-1 text-[11px] transition hover:bg-[var(--color-muted)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
