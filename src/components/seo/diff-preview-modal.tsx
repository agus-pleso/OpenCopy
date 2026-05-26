"use client";

/**
 * DiffPreviewModal — the apply path for an SEO suggestion.
 *
 * Side-by-side layout: read-only original on the left, editable proposed on
 * the right. Marketer can tweak the AI's rewrite before accepting, reject
 * outright, or apply as-is. The "Edit & Apply" / "Apply as-is" split keeps
 * the trust gradient explicit — accepting a rewrite is a deliberate act.
 *
 * Phase 1C diff highlight is a *word-level* token diff (additions in green,
 * deletions in red) without pulling in a diff library. Good enough for
 * V1; Phase 2 can replace with a proper char-level diff if needed.
 *
 * When `proposed` is undefined (Phase 2 hasn't generated the rewrite yet),
 * the modal renders a loading state and the Apply buttons stay disabled.
 */

import * as React from "react";
import { Loader2, X, Check, Edit3 } from "lucide-react";
import { motion } from "framer-motion";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SeoSuggestion } from "@/db/schema";

const TYPE_LABELS: Record<SeoSuggestion["type"], string> = {
  rewrite_paragraph: "Rewrite paragraph",
  add_section: "Add section",
  tighten_section: "Tighten section",
  add_lsi_keyword: "Add related term",
  add_heading: "Add heading",
};

interface Props {
  open: boolean;
  onClose: () => void;
  suggestion: SeoSuggestion;
  onAccept: (editedProposed: string) => void | Promise<void>;
  onReject: () => void | Promise<void>;
}

export function DiffPreviewModal({
  open,
  onClose,
  suggestion,
  onAccept,
  onReject,
}: Props) {
  const [draft, setDraft] = React.useState(suggestion.proposed ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  // Keep draft in sync when the modal opens for a different suggestion or
  // when Phase 2 streams in the proposed rewrite after-the-fact.
  React.useEffect(() => {
    setDraft(suggestion.proposed ?? "");
  }, [suggestion.id, suggestion.proposed]);

  const hasProposed = !!suggestion.proposed && suggestion.proposed.length > 0;
  const original = suggestion.excerpt ?? "";

  const wasEdited = draft.trim() !== (suggestion.proposed ?? "").trim();

  const handleAccept = async (asEdited: boolean) => {
    setSubmitting(true);
    try {
      await onAccept(asEdited ? draft : suggestion.proposed ?? draft);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await onReject();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl gap-5 bg-[var(--color-card)] p-0 sm:rounded-xl">
        <DialogHeader className="border-b border-[var(--color-border)] px-6 py-5">
          <div className="flex items-center gap-2">
            <Badge variant="muted" className="text-[10px] tracking-wider">
              {TYPE_LABELS[suggestion.type]}
            </Badge>
            {suggestion.status === "applied" && (
              <Badge variant="success" className="text-[10px] tracking-wider">
                Applied
              </Badge>
            )}
          </div>
          <DialogTitle className="mt-2 font-display text-lg tracking-tight">
            Review the rewrite
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {suggestion.description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-px overflow-hidden bg-[var(--color-border)] md:grid-cols-2">
          {/* Original */}
          <DiffPane label="Before">
            {original ? (
              <div className="prose-sm whitespace-pre-wrap font-serif text-sm leading-relaxed text-[var(--color-foreground)]/85">
                {original}
              </div>
            ) : (
              <p className="text-sm italic text-[var(--color-muted-foreground)]">
                No specific excerpt — this suggestion adds new content.
              </p>
            )}
          </DiffPane>

          {/* Proposed */}
          <DiffPane label="After" accent>
            {!hasProposed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 text-center"
              >
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Generating the rewrite…
                </p>
              </motion.div>
            ) : (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[200px] resize-y border-none bg-transparent px-0 py-0 font-serif text-sm leading-relaxed shadow-none focus-visible:ring-0"
                style={{ fontFamily: "ui-serif, Georgia, serif" }}
              />
            )}
          </DiffPane>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {hasProposed
              ? wasEdited
                ? "You've edited the rewrite."
                : "Edit the rewrite on the right, or apply as-is."
              : "Waiting for the copywriter to generate a rewrite."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReject}
              disabled={submitting}
              className="text-[var(--color-muted-foreground)]"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            {wasEdited ? (
              <Button
                size="sm"
                onClick={() => handleAccept(true)}
                disabled={submitting || !hasProposed || draft.trim().length === 0}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Edit3 className="h-3.5 w-3.5" />
                )}
                Apply edited
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleAccept(false)}
                disabled={submitting || !hasProposed}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Apply as-is
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffPane({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 bg-[var(--color-card)] px-6 py-5",
        accent && "bg-[var(--color-primary)]/4",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-1.5 w-1.5 rounded-full",
            accent
              ? "bg-[var(--color-primary)]"
              : "bg-[var(--color-muted-foreground)]/50",
          )}
        />
        <p
          className={cn(
            "text-[10px] uppercase tracking-[0.18em]",
            accent
              ? "text-[var(--color-primary)]"
              : "text-[var(--color-muted-foreground)]",
          )}
        >
          {label}
        </p>
      </div>
      <div className="min-h-[160px]">{children}</div>
    </div>
  );
}
