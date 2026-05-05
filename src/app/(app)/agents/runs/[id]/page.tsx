import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Languages, RotateCw } from "lucide-react";

import { getAgentRun } from "@/server/actions/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VariantCard } from "@/components/agents/variant-card";
import { LocalizerResult } from "@/components/agents/localizer-result";
import { AgentTimeline } from "@/components/agents/agent-timeline";
import { formatDistanceShort } from "@/lib/utils";
import type {
  CopywriterBrief,
  LocalizerBrief,
} from "@/db/schema";

const STATUS_VARIANT = {
  succeeded: "success",
  running: "warning",
  queued: "muted",
  failed: "destructive",
  cancelled: "outline",
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RunPage({ params }: PageProps) {
  const { id } = await params;
  const run = await getAgentRun(id);
  if (!run) notFound();

  const Icon = run.kind === "copywriter" ? Bot : Languages;
  const variants = run.variants ?? [];

  const cwBrief = run.kind === "copywriter" ? (run.brief as CopywriterBrief) : null;
  const locBrief = run.kind === "localizer" ? (run.brief as LocalizerBrief) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[var(--color-primary)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              {run.kind === "copywriter" ? "Copywriter run" : "Localizer run"}
            </p>
            <Badge
              variant={STATUS_VARIANT[run.status]}
              className="text-[10px] tracking-wider"
            >
              {run.status}
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
            {cwBrief?.objective
              ? cwBrief.objective.length > 100
                ? cwBrief.objective.slice(0, 100) + "…"
                : cwBrief.objective
              : locBrief
              ? `Localize ${locBrief.sourceLocale.toUpperCase()} → ${(
                  locBrief.targetLocales ??
                  (locBrief.targetLocale ? [locBrief.targetLocale] : [])
                )
                  .map((l) => l.toUpperCase())
                  .join(", ")}`
              : "Run"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
            {run.voice && (
              <Link
                href={`/voices/${run.voice.id}`}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                Voice · {run.voice.name}
              </Link>
            )}
            {cwBrief && <span>Channel · {cwBrief.channel}</span>}
            {cwBrief && <span>Locale · {cwBrief.locale.toUpperCase()}</span>}
            <span>Started {formatDistanceShort(run.createdAt)}</span>
            {run.durationMs != null && (
              <span className="tabular-nums">
                Total · {(run.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            href={
              run.kind === "copywriter" ? "/agents/copywriter" : "/agents/localizer"
            }
          >
            <RotateCw className="h-3.5 w-3.5" /> New run
          </Link>
        </Button>
      </div>

      {run.status === "failed" && run.error && (
        <div className="mt-6 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-4 py-3 text-sm text-[var(--color-destructive)]">
          <p className="font-medium">Run failed</p>
          <p className="mt-1 font-mono text-[12px]">{run.error}</p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-4">
          {run.kind === "copywriter" &&
            variants.map((v) => (
              <VariantCard
                key={v.id}
                variant={v}
                canRefine={!!run.voiceId}
              />
            ))}
          {run.kind === "localizer" && variants[0] && locBrief && (
            <LocalizerResult
              variant={variants[0]}
              sourceText={locBrief.sourceText}
              sourceLocale={locBrief.sourceLocale}
            />
          )}
          {variants.length === 0 && run.status !== "failed" && (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              No variants yet — agents are still running. Refresh in a moment.
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Agent timeline
          </p>
          <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <AgentTimeline steps={run.steps ?? []} />
          </div>
        </aside>
      </div>
    </div>
  );
}
