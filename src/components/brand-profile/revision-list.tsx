"use client";

/**
 * revision-list — snapshot history with "Restore" buttons. No diff view in
 * V1 per spec (just the list + revert action). A confirm dialog gates the
 * destructive rollback.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceShort } from "@/lib/utils";
import {
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  Globe,
  MessageSquareQuote,
  UserPlus,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import type { BrandProfileRevision, BrandProfileRevisionType } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rollBackTo } from "@/server/actions/brand-profile";

const TYPE_LABELS: Record<BrandProfileRevisionType, string> = {
  initial: "Profile created",
  manual_save: "Manual save",
  nl_command: "Natural-language update",
  deep_dive_save: "Deep-dive save",
  crawl_extract: "Extractor applied",
  roll_back: "Rolled back",
  voice_analyzer: "Voice analyzer ran",
};

const TYPE_ICONS: Record<
  BrandProfileRevisionType,
  React.ComponentType<{ className?: string }>
> = {
  initial: Sparkles,
  manual_save: History,
  nl_command: Wand2,
  deep_dive_save: MessageSquareQuote,
  crawl_extract: Globe,
  roll_back: RotateCcw,
  voice_analyzer: UserPlus,
};

interface Props {
  revisions: BrandProfileRevision[];
}

export function RevisionList({ revisions }: Props) {
  const router = useRouter();
  const [target, setTarget] = React.useState<BrandProfileRevision | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (revisions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 px-6 py-12 text-center">
        <History className="mx-auto h-6 w-6 text-[var(--color-muted-foreground)]" />
        <p className="mt-3 font-display tracking-tight">No revisions yet</p>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Every save, NL command, and deep-dive writes a revision you can roll back to.
        </p>
      </div>
    );
  }

  const onRestore = () => {
    if (!target) return;
    startTransition(async () => {
      try {
        await rollBackTo(target.id);
        toast.success("Rolled back.");
        setTarget(null);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message || "Couldn't restore.");
      }
    });
  };

  return (
    <>
      <ol className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        {revisions.map((r, idx) => {
          const Icon = TYPE_ICONS[r.revisionType];
          return (
            <li
              key={r.id}
              className="flex items-start gap-3 border-t border-[var(--color-border)]/60 px-5 py-4 first:border-t-0"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
                  {TYPE_LABELS[r.revisionType]}
                  {idx === 0 && (
                    <span className="rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-success)]">
                      Current
                    </span>
                  )}
                </div>
                {r.note && (
                  <p className="mt-1 text-sm text-pretty text-[var(--color-muted-foreground)]">
                    {r.note}
                  </p>
                )}
                <p className="mt-1 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                  {formatDistanceShort(r.createdAt)}
                </p>
              </div>
              {idx > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setTarget(r)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </Button>
              )}
            </li>
          );
        })}
      </ol>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back to this revision?</DialogTitle>
            <DialogDescription>
              This will overwrite your current brand profile with the snapshot from{" "}
              {target ? formatDistanceShort(target.createdAt) : "earlier"}. A new
              revision will be created so you can re-roll if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={onRestore} disabled={pending} className="gap-1.5">
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
