"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Copy,
  Check,
  Sparkles,
  Trash2,
  AlertCircle,
  ChevronDown,
  Wand2,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/exports/export-button";
import { cn } from "@/lib/utils";
import {
  refineVariant,
  saveVariant,
  discardVariant,
} from "@/server/actions/agents";
import type { CopyVariant } from "@/db/schema";
import type { VoiceAuditIssue } from "@/lib/agents";

const SEV_COLOR: Record<VoiceAuditIssue["severity"], string> = {
  high: "text-[var(--color-destructive)]",
  medium: "text-[var(--color-warning)]",
  low: "text-[var(--color-muted-foreground)]",
};

interface Props {
  variant: CopyVariant;
  /** When true, refine button is shown if score < 90 and the variant has a voice. */
  canRefine: boolean;
}

export function VariantCard({ variant: initial, canRefine }: Props) {
  const [variant, setVariant] = React.useState(initial);
  const [pendingRefine, startRefine] = useTransition();
  const [pendingSave, startSave] = useTransition();
  const [pendingDiscard, startDiscard] = useTransition();
  const [expanded, setExpanded] = React.useState(false);
  const [showRefined, setShowRefined] = React.useState(false);

  const score = showRefined && variant.refinedScore != null
    ? variant.refinedScore
    : variant.auditScore ?? 0;

  const tier =
    score >= 90
      ? { label: "On-brand", tint: "success" as const }
      : score >= 70
      ? { label: "Light edits", tint: "warning" as const }
      : { label: "Off-brand", tint: "destructive" as const };

  const tintBg =
    tier.tint === "success"
      ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
      : tier.tint === "warning"
      ? "bg-[var(--color-warning)]/12 text-[var(--color-warning)]"
      : "bg-[var(--color-destructive)]/12 text-[var(--color-destructive)]";

  const issues = (variant.auditIssues ?? []) as VoiceAuditIssue[];
  const visibleContent =
    showRefined && variant.refinedContent
      ? variant.refinedContent
      : variant.content;

  const onCopy = () => {
    navigator.clipboard.writeText(visibleContent);
    toast.success("Copied.");
  };

  const onRefine = () => {
    startRefine(async () => {
      try {
        const res = await refineVariant({ variantId: variant.id });
        setVariant({
          ...variant,
          refinedContent: res.refinedContent,
          refinedScore: res.refinedScore,
        });
        setShowRefined(true);
        toast.success(`Refined → score ${res.refinedScore}.`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const onSave = () => {
    startSave(async () => {
      await saveVariant(variant.id);
      setVariant({ ...variant, status: "saved" });
      toast.success("Saved to library.");
    });
  };

  const onDiscard = () => {
    startDiscard(async () => {
      await discardVariant(variant.id);
      setVariant({ ...variant, status: "discarded" });
      toast.success("Variant discarded.");
    });
  };

  if (variant.status === "discarded") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
        <Trash2 className="h-4 w-4" />
        <span>Discarded — {variant.label}</span>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
    >
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-3">
        <span className="text-xs font-mono text-[var(--color-muted-foreground)]">
          {String(variant.seq + 1).padStart(2, "0")}
        </span>
        <h3 className="font-display text-base tracking-tight">
          {variant.label ?? `Variant ${variant.seq + 1}`}
        </h3>
        {variant.status === "saved" && (
          <Badge variant="success" className="text-[10px] tracking-wider">
            Saved
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              tintBg,
            )}
          >
            <span className="font-mono">{score}</span>
            <span className="opacity-70">·</span>
            <span>{tier.label}</span>
          </span>
        </div>
      </div>

      {variant.strategy && (
        <p className="border-b border-[var(--color-border)]/60 bg-[var(--color-muted)]/30 px-5 py-2 text-xs uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
          Angle ·{" "}
          <span className="normal-case tracking-normal text-[var(--color-foreground)]">
            {variant.strategy}
          </span>
        </p>
      )}

      <article
        className="prose-sm whitespace-pre-wrap px-5 py-5 text-[15px] leading-relaxed font-serif text-pretty"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      >
        {visibleContent}
      </article>

      {variant.refinedContent && (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)]/60 bg-[var(--color-muted)]/30 px-5 py-2 text-xs">
          <Wand2 className="h-3 w-3 text-[var(--color-primary)]" />
          <span className="text-[var(--color-muted-foreground)]">
            Refined version available.
          </span>
          <button
            type="button"
            onClick={() => setShowRefined((v) => !v)}
            className="ml-auto text-[var(--color-primary)] hover:underline"
          >
            {showRefined ? "Show original" : "Show refined"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <ExportButton kind="variant" id={variant.id} variant="ghost" label="" />
        {issues.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="gap-1.5"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {issues.length} issue{issues.length === 1 ? "" : "s"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </Button>
        )}
        {canRefine &&
          score < 90 &&
          !variant.refinedContent &&
          variant.status !== "saved" && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefine}
              disabled={pendingRefine}
            >
              {pendingRefine ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Refine
            </Button>
          )}
        <div className="ml-auto flex items-center gap-2">
          {variant.status !== "saved" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={pendingDiscard}
              className="text-[var(--color-muted-foreground)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
          )}
          {variant.status !== "saved" && (
            <Button size="sm" onClick={onSave} disabled={pendingSave}>
              {pendingSave ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Save to library
            </Button>
          )}
          {variant.status === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && issues.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="bg-[var(--color-muted)]/30 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Audit · {variant.auditSummary}
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {issues
                  .slice()
                  .sort(
                    (a, b) =>
                      sevRank(b.severity) - sevRank(a.severity),
                  )
                  .map((issue, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] tracking-wider"
                        >
                          {issue.category.replace("_", " ")}
                        </Badge>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider",
                            SEV_COLOR[issue.severity],
                          )}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <blockquote className="mt-1.5 border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)]/40 px-2.5 py-1 text-sm italic">
                        &ldquo;{issue.excerpt}&rdquo;
                      </blockquote>
                      <p className="mt-1.5 text-pretty">{issue.explanation}</p>
                      {issue.suggestion && (
                        <p className="mt-1.5 rounded border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-2 py-1 text-pretty">
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-success)]">
                            Suggestion ·
                          </span>{" "}
                          {issue.suggestion}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function sevRank(s: VoiceAuditIssue["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}
