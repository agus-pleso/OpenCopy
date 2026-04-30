import {
  DollarSign,
  Zap,
  Activity,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { getUsageSummary } from "@/server/actions/usage";
import { PROVIDER_LABELS } from "@/lib/ai/model-pricing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UsageWindowToggle } from "@/components/settings/usage-window-toggle";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

const FEATURE_LABEL: Record<string, string> = {
  copywriter: "Copywriter agent",
  localizer: "Localizer agent",
  chat: "Chat assistant",
  "voice-audit": "Voice auditor",
  "voice-analyze": "Voice analyzer",
  "editor-command": "Editor commands",
};

export default async function UsagePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const days = Math.min(Math.max(Number(params.days) || 30, 7), 90);
  const summary = await getUsageSummary({ windowDays: days });

  const fmtUsd = (n: number) =>
    n < 0.01 ? "<$0.01" : `$${n.toFixed(n < 1 ? 3 : 2)}`;
  const fmtTok = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : n.toLocaleString();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Token consumption + estimated cost across agent runs and chat.
            Last {summary.windowDays} days.
          </p>
        </div>
        <UsageWindowToggle current={summary.windowDays} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={DollarSign}
          label="Estimated cost"
          value={fmtUsd(summary.totalCostUsd)}
          hint="OpenRouter live pricing + hardcoded direct rates"
        />
        <SummaryCard
          icon={Zap}
          label="Total calls"
          value={summary.totalCalls.toLocaleString()}
          hint="Agent steps + chat assistant messages"
        />
        <SummaryCard
          icon={Activity}
          label="Input tokens"
          value={fmtTok(summary.totalInputTokens)}
          hint="Prompt tokens consumed"
        />
        <SummaryCard
          icon={Sparkles}
          label="Output tokens"
          value={fmtTok(summary.totalOutputTokens)}
          hint="Completion tokens generated"
        />
      </div>

      {!summary.openRouterPricingLoaded && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">OpenRouter pricing unavailable</p>
            <p className="mt-1 text-xs text-pretty">
              Couldn&apos;t fetch live pricing. OpenRouter-routed costs show as
              $0.00 below; direct provider costs are still computed from the
              hardcoded rate table.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>By feature</CardTitle>
          <CardDescription>
            Where the spend goes — copywriter agent runs vs chat vs voice audits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.byFeature.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No usage in the last {summary.windowDays} days.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {summary.byFeature.map((f) => {
                const pctOfTotal = summary.totalCostUsd
                  ? (f.costUsd / summary.totalCostUsd) * 100
                  : 0;
                return (
                  <li
                    key={f.feature}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium tracking-tight">
                        {FEATURE_LABEL[f.feature] ?? f.feature}
                      </p>
                      <div className="relative mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                        <div
                          className="absolute inset-y-0 left-0 bg-[var(--color-primary)] transition-all"
                          style={{ width: `${Math.min(100, pctOfTotal)}%` }}
                        />
                      </div>
                    </div>
                    <span className="tabular-nums text-[var(--color-muted-foreground)]">
                      {f.calls.toLocaleString()} calls
                    </span>
                    <span className="tabular-nums text-[var(--color-muted-foreground)]">
                      {fmtTok(f.inputTokens + f.outputTokens)} tok
                    </span>
                    <span className="tabular-nums font-mono">
                      {fmtUsd(f.costUsd)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By model</CardTitle>
          <CardDescription>
            Where each call routed. Costs sum across all features for a model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.byModel.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No model calls in this window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Feature</th>
                    <th className="py-2 pr-3 text-right">Calls</th>
                    <th className="py-2 pr-3 text-right">In</th>
                    <th className="py-2 pr-3 text-right">Out</th>
                    <th className="py-2 pr-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {summary.byModel.map((m, i) => (
                    <tr key={`${m.modelId}-${m.feature}-${i}`}>
                      <td className="py-2 pr-3 font-mono text-xs">{m.modelId}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant={m.provider === "unknown" ? "muted" : "outline"}
                          className={cn(
                            "text-[10px] tracking-wider",
                            m.provider === "ollama" && "text-[var(--color-success)]",
                          )}
                        >
                          {m.provider === "unknown"
                            ? "?"
                            : PROVIDER_LABELS[m.provider]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {FEATURE_LABEL[m.feature] ?? m.feature}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {m.calls.toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[var(--color-muted-foreground)]">
                        {fmtTok(m.inputTokens)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[var(--color-muted-foreground)]">
                        {fmtTok(m.outputTokens)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {fmtUsd(m.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--color-muted-foreground)] text-pretty">
        Cost is an estimate, not a bill. OpenRouter pricing is live; direct
        provider rates are from a hardcoded table refreshed periodically.
        Embeddings, editor commands, and campaign asset drafting aren&apos;t
        tracked here yet — that lands in V1.6.
      </p>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        <Icon className="h-3 w-3 text-[var(--color-primary)]" />
        {label}
      </div>
      <p className="mt-2 font-display text-2xl tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">{hint}</p>
    </div>
  );
}
