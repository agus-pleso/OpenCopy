"use client";

/**
 * CriterionCard — one of seven per-criterion tiles in the audit results.
 *
 * Marketer-facing labels are intentionally non-technical ("Search intent fit",
 * not "intent_fit_jaccard") so the marketer doesn't have to translate. The
 * popover with the raw `details` jsonb is for the curious/auditor; the card
 * top reads as a status at a glance.
 */

import * as React from "react";
import { motion } from "framer-motion";

import { ScoreGauge } from "./score-gauge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeoCriterionScore } from "@/db/schema";

type CriterionKey =
  | "density"
  | "semantic"
  | "intent"
  | "structure"
  | "length"
  | "readability"
  | "contentGap";

const LABELS: Record<CriterionKey, { title: string; sub: string }> = {
  density: {
    title: "Keyword density",
    sub: "How often the primary keyword appears, weighed against length.",
  },
  semantic: {
    title: "Semantic coverage",
    sub: "Whether the page covers terms search engines associate with the topic.",
  },
  intent: {
    title: "Search intent fit",
    sub: "How well the page satisfies what searchers actually want.",
  },
  structure: {
    title: "Heading structure",
    sub: "H1 / H2 / H3 hierarchy and outline coherence.",
  },
  length: {
    title: "Length",
    sub: "Word count vs. what's competitive for this keyword.",
  },
  readability: {
    title: "Readability",
    sub: "Flesch reading ease + grade level vs. the audience.",
  },
  contentGap: {
    title: "Content gap",
    sub: "Topics top-ranking pages cover that you don't.",
  },
};

interface Props {
  criterion: CriterionKey;
  data: SeoCriterionScore;
  /** Stagger entry: ms after page mount. */
  delay?: number;
}

export function CriterionCard({ criterion, data, delay = 0 }: Props) {
  const meta = LABELS[criterion];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay / 1000, ease: "easeOut" }}
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm transition-shadow hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm tracking-tight">{meta.title}</p>
          <p className="mt-1 text-xs leading-snug text-[var(--color-muted-foreground)] text-pretty">
            {meta.sub}
          </p>
        </div>
        <DetailsPopover criterion={criterion} data={data} />
      </div>

      <div className="flex items-end justify-between">
        <ScoreGauge score={data.score} size="sm" delay={delay + 200} />
        <ScoreTier score={data.score} />
      </div>
    </motion.div>
  );
}

function ScoreTier({ score }: { score: number }) {
  const tier =
    score >= 80
      ? { label: "Strong", tint: "text-[var(--color-success)]" }
      : score >= 60
      ? { label: "Solid", tint: "text-[var(--color-primary)]" }
      : score >= 40
      ? { label: "Needs work", tint: "text-[var(--color-warning)]" }
      : { label: "Critical", tint: "text-[var(--color-destructive)]" };
  return (
    <p className={cn("text-[10px] uppercase tracking-[0.18em]", tier.tint)}>
      {tier.label}
    </p>
  );
}

function DetailsPopover({
  criterion,
  data,
}: {
  criterion: CriterionKey;
  data: SeoCriterionScore;
}) {
  const entries = Object.entries(data.details ?? {}).filter(
    ([k]) => k !== "stub",
  );
  const isStub = (data.details as Record<string, unknown>)?.stub === true;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-[var(--color-muted-foreground)]"
          aria-label="View criterion details"
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-72 border-[var(--color-border)] p-4"
      >
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {LABELS[criterion].title}
        </p>
        {isStub && (
          <p className="mt-2 rounded-md border border-dashed border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2.5 py-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
            Placeholder run — Phase 2 wires the real scorer.
          </p>
        )}
        {entries.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            No details for this criterion.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {entries.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-[var(--color-muted-foreground)]">
                  {humanizeKey(k)}
                </dt>
                <dd className="font-mono text-[11px] text-[var(--color-foreground)] break-all">
                  {formatValue(v)}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </PopoverContent>
    </Popover>
  );
}

function humanizeKey(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v))
    return v.length === 0 ? "(none)" : v.map(String).join(", ");
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(3);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
