import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Search, Sparkles } from "lucide-react";

import { getDocument } from "@/server/actions/documents";
import {
  getAuditHistory,
  getLatestAudit,
} from "@/server/actions/audit-seo";
import { Badge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/seo/score-gauge";
import { CriterionCard } from "@/components/seo/criterion-card";
import { SuggestionList } from "@/components/seo/suggestion-list";
import { AuditTrigger } from "./audit-trigger";
import { formatDistanceShort } from "@/lib/utils";
import type { SeoCriterionScores, SeoAuditReport } from "@/db/schema";

interface PageProps {
  params: Promise<{ docId: string }>;
}

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

const CRITERION_KEYS: (keyof SeoCriterionScores)[] = [
  "density",
  "semantic",
  "intent",
  "structure",
  "length",
  "readability",
  "contentGap",
];

export default async function AuditPage({ params }: PageProps) {
  const { docId } = await params;
  const doc = await getDocument(docId);
  if (!doc) notFound();

  // Loaded in parallel — neither depends on the other.
  const [latest, history] = await Promise.all([
    getLatestAudit(docId),
    getAuditHistory(docId),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      {/* Header */}
      <Link
        href={`/documents/${docId}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to document
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[var(--color-primary)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              SEO audit
            </p>
            <Badge variant="muted" className="text-[10px] tracking-wider">
              {LOCALE_LABELS[doc.locale] ?? doc.locale}
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
            {doc.title}
          </h1>
        </div>
      </div>

      {/* Body — either empty state or full results */}
      {latest ? (
        <ResultsView
          report={latest}
          history={history}
          docId={docId}
        />
      ) : (
        <EmptyState docId={docId} />
      )}
    </div>
  );
}

function EmptyState({ docId }: { docId: string }) {
  return (
    <div className="mt-10 flex flex-col gap-8">
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-8 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="font-display text-xl tracking-tight">
          No audit yet
        </h2>
        <p className="max-w-md text-pretty text-sm text-[var(--color-muted-foreground)]">
          Run an audit to see your draft scored across seven SEO axes, with
          concrete rewrites you can apply with one click.
        </p>
      </div>
      <AuditTrigger docId={docId} />
    </div>
  );
}

function ResultsView({
  report,
  history,
  docId,
}: {
  report: SeoAuditReport;
  history: SeoAuditReport[];
  docId: string;
}) {
  const composite = report.compositeScore;

  return (
    <div className="mt-10 flex flex-col gap-10">
      {/* Composite gauge + keyword summary */}
      <section className="grid items-center gap-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm md:grid-cols-[auto_1fr] md:p-10">
        <div className="flex justify-center">
          <ScoreGauge score={composite} size="lg" variant="tiered" />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Composite score
          </p>
          <p className="font-display text-2xl tracking-tight text-balance">
            {compositeHeadline(composite)}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm">
            <KeywordChip
              label="Primary"
              value={report.primaryKeyword}
              hint={report.primaryKeywordInferred ? "AI-inferred" : "you set"}
            />
            {report.secondaryKeywords.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                  Secondary
                </span>
                {report.secondaryKeywords.slice(0, 6).map((kw) => (
                  <span
                    key={kw}
                    className="rounded-md bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--color-foreground)]/85"
                  >
                    {kw}
                  </span>
                ))}
                {report.secondaryKeywords.length > 6 && (
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">
                    +{report.secondaryKeywords.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Audited {formatDistanceShort(report.createdAt)}
            {report.detectedIntent && ` · ${report.detectedIntent} intent`}
          </p>
        </div>
      </section>

      {/* Criterion grid */}
      <section>
        <div className="flex items-baseline justify-between">
          <p className="font-display text-lg tracking-tight">
            Per-criterion breakdown
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Tap an info icon for the raw signal.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CRITERION_KEYS.map((key, i) => (
            <CriterionCard
              key={key}
              criterion={key}
              data={report.criterionScores[key]}
              delay={i * 100}
            />
          ))}
        </div>
      </section>

      {/* Suggestions */}
      <section>
        <SuggestionList
          reportId={report.id}
          initialSuggestions={report.suggestions}
        />
      </section>

      {/* History timeline + re-run */}
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              History
            </p>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              This is the first audit.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {history.map((h, i) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--color-muted)]/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display text-base tabular-nums">
                      {h.compositeScore}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs text-[var(--color-foreground)]/85">
                        {formatDistanceShort(h.createdAt)}
                        {i === 0 && (
                          <span className="ml-1.5 rounded-sm bg-[var(--color-primary)]/10 px-1 text-[10px] uppercase tracking-wider text-[var(--color-primary)]">
                            latest
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-[var(--color-muted-foreground)] font-mono">
                        {h.primaryKeyword}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] tracking-wider">
                    {h.locale}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Re-audit
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm">
            <AuditTrigger docId={docId} compact />
          </div>
        </div>
      </section>
    </div>
  );
}

function KeywordChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="rounded-md bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-primary)]">
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-[var(--color-muted-foreground)]">
          ({hint})
        </span>
      )}
    </span>
  );
}

function compositeHeadline(score: number): string {
  if (score >= 85) return "Ship-ready. The SERP signals line up.";
  if (score >= 70) return "Strong draft — a few high-leverage edits left.";
  if (score >= 55) return "Solid bones, but the suggestions are worth applying.";
  if (score >= 40) return "There's clear room to climb. Work the suggestions.";
  return "Needs structural work before this competes.";
}
