"use client";

/**
 * SuggestionList — the apply/reject board.
 *
 * Each suggestion gets a card with type badge, description, optional
 * excerpt-quote, and an apply/reject pair. Apply opens the diff modal;
 * reject is a one-click action with optimistic UI.
 *
 * Phase 2 will populate `suggestion.proposed` before the marketer clicks
 * "Apply" (the modal also gracefully handles the streaming case). Phase 1C
 * passes the suggestion as-is and lets the apply server action backfill
 * the placeholder.
 */

import * as React from "react";
import { useTransition } from "react";
import {
  Sparkles,
  ListPlus,
  Scissors,
  Hash,
  Plus,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiffPreviewModal } from "./diff-preview-modal";
import {
  applySeoSuggestion,
  generateSuggestionRewrite,
  rejectSeoSuggestion,
} from "@/server/actions/audit-seo";
import { cn } from "@/lib/utils";
import { isRedirectError } from "@/lib/utils";
import type { SeoSuggestion } from "@/db/schema";

const TYPE_META: Record<
  SeoSuggestion["type"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  rewrite_paragraph: { label: "Rewrite paragraph", icon: Sparkles },
  add_section: { label: "Add section", icon: ListPlus },
  tighten_section: { label: "Tighten section", icon: Scissors },
  add_lsi_keyword: { label: "Add related term", icon: Hash },
  add_heading: { label: "Add heading", icon: Plus },
};

interface Props {
  reportId: string;
  initialSuggestions: SeoSuggestion[];
}

export function SuggestionList({ reportId, initialSuggestions }: Props) {
  const [suggestions, setSuggestions] =
    React.useState<SeoSuggestion[]>(initialSuggestions);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Tracks suggestions currently being rewritten by the copywriter agent.
   *  Lets us avoid double-firing if the marketer opens/closes the modal fast. */
  const generatingRef = React.useRef<Set<string>>(new Set());

  // Re-sync when fresh server data arrives (e.g., revalidatePath after run).
  React.useEffect(() => {
    setSuggestions(initialSuggestions);
  }, [initialSuggestions]);

  const open = suggestions.find((s) => s.id === openId) ?? null;

  const visible = suggestions.filter((s) => s.status !== "rejected");
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  /**
   * Open the modal and lazily generate the rewrite via the copywriter
   * sub-agent if it doesn't exist yet. Idempotent on the server too (the
   * action returns early if `proposed` is already set), so a fast
   * open/close/open round-trip stays cheap.
   */
  const openSuggestion = (suggestion: SeoSuggestion) => {
    setOpenId(suggestion.id);
    if (suggestion.proposed && suggestion.proposed.trim().length > 0) return;
    if (generatingRef.current.has(suggestion.id)) return;
    generatingRef.current.add(suggestion.id);
    (async () => {
      try {
        const { proposed } = await generateSuggestionRewrite({
          reportId,
          suggestionId: suggestion.id,
        });
        setSuggestions((prev) =>
          prev.map((s) => (s.id === suggestion.id ? { ...s, proposed } : s)),
        );
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error(
          `Couldn't generate a rewrite: ${(err as Error).message}`,
        );
      } finally {
        generatingRef.current.delete(suggestion.id);
      }
    })();
  };

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/40 p-8 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No open suggestions. Run a fresh audit to see new ideas.
        </p>
      </div>
    );
  }

  const handleApply = async (
    suggestionId: string,
    editedProposed: string,
  ) => {
    startTransition(async () => {
      try {
        await applySeoSuggestion({
          reportId,
          suggestionId,
          editedProposed,
        });
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestionId
              ? {
                  ...s,
                  status: "applied",
                  appliedAt: new Date().toISOString(),
                  proposed: editedProposed,
                }
              : s,
          ),
        );
        setOpenId(null);
        toast.success("Suggestion applied to the document.");
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  const handleReject = async (suggestionId: string) => {
    // Optimistically mark rejected, rollback on error.
    const prev = suggestions;
    setSuggestions((s) =>
      s.map((x) =>
        x.id === suggestionId
          ? { ...x, status: "rejected", rejectedAt: new Date().toISOString() }
          : x,
      ),
    );
    setOpenId(null);
    startTransition(async () => {
      try {
        await rejectSeoSuggestion({ reportId, suggestionId });
        toast("Suggestion dismissed.");
      } catch (err) {
        if (isRedirectError(err)) throw err;
        setSuggestions(prev);
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg tracking-tight">Suggestions</p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {pendingCount} pending · {suggestions.length - pendingCount} acted on
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {visible.map((s, i) => {
            const meta = TYPE_META[s.type];
            const Icon = meta.icon;
            const isApplied = s.status === "applied";
            return (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
                transition={{
                  duration: 0.3,
                  delay: i * 0.05,
                  ease: "easeOut",
                }}
                className={cn(
                  "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm transition-shadow hover:shadow-md",
                  isApplied && "bg-[var(--color-success)]/4",
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      isApplied
                        ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                        : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] tracking-wider"
                      >
                        {meta.label}
                      </Badge>
                      {isApplied && (
                        <Badge
                          variant="success"
                          className="text-[10px] tracking-wider"
                        >
                          Applied
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-pretty text-sm leading-snug">
                      {s.description}
                    </p>
                    {s.excerpt && (
                      <blockquote className="mt-3 border-l-2 border-[var(--color-primary)]/60 bg-[var(--color-muted)]/40 px-3 py-1.5 text-xs italic text-[var(--color-foreground)]/85">
                        &ldquo;{truncate(s.excerpt, 220)}&rdquo;
                      </blockquote>
                    )}
                  </div>
                  {!isApplied && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReject(s.id)}
                        disabled={pending}
                        className="text-[var(--color-muted-foreground)]"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openSuggestion(s)}
                        disabled={pending}
                      >
                        {pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Apply
                      </Button>
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {open && (
        <DiffPreviewModal
          open={!!open}
          onClose={() => setOpenId(null)}
          suggestion={open}
          onAccept={(edited) => handleApply(open.id, edited)}
          onReject={() => handleReject(open.id)}
        />
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}
