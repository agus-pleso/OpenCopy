import Link from "next/link";
import { Bot, Languages, ChevronRight } from "lucide-react";

import { listAgentRuns } from "@/server/actions/agents";
import { Badge } from "@/components/ui/badge";
import { AgentCardLink } from "@/components/agents/agent-card-link";
import { formatDistanceShort } from "@/lib/utils";

const STATUS_VARIANT = {
  succeeded: "success",
  running: "warning",
  queued: "muted",
  failed: "destructive",
  cancelled: "outline",
} as const;

export default async function AgentsPage() {
  const recent = await listAgentRuns({ limit: 8 });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Agents
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
          Multi-agent flows that show their work.
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
          Two flagship agents, both built on the same scaffold and both honoring
          your brand voice. Every variant ships with its audit. Every transcreation ships with cultural notes and a back-translation.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <AgentCardLink
          href="/agents/copywriter"
          icon={Bot}
          name="Copywriter"
          description="Brief in. Multiple on-brand variants out, each with a voice audit."
          steps={[
            "Planner — N differentiated angles",
            "Drafters — variants in parallel",
            "Voice Auditor — line-level scoring",
            "Refiner — one-click rewrite",
          ]}
        />
        <AgentCardLink
          href="/agents/localizer"
          icon={Languages}
          name="Localizer"
          description="Source copy → transcreated for the target locale. Voice-aware, with a sanity-check back-translation."
          steps={[
            "Cultural Adapter — flag idioms / formality",
            "Localizer — transcreate to PL · EN · RO · UA",
            "Back-Translator — literal sanity check",
            "Voice Auditor — validate on-brand",
          ]}
        />
      </div>

      {recent.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl tracking-tight">Recent runs</h2>
            <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {recent.length} of last 25
            </span>
          </div>
          <ul className="mt-4 flex flex-col divide-y divide-[var(--color-border)]/60 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
            {recent.map((r) => {
              const briefAny = r.brief as unknown as Record<string, unknown>;
              const objective =
                typeof briefAny.objective === "string"
                  ? briefAny.objective
                  : typeof briefAny.contextHint === "string"
                  ? briefAny.contextHint
                  : null;
              const targetLocale = briefAny.targetLocale as string | undefined;
              const Icon = r.kind === "copywriter" ? Bot : Languages;
              return (
                <li key={r.id}>
                  <Link
                    href={`/agents/runs/${r.id}`}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 text-sm transition hover:bg-[var(--color-muted)]/30"
                  >
                    <Icon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                    <div className="min-w-0">
                      <p className="font-medium tracking-tight line-clamp-1">
                        {r.kind === "copywriter"
                          ? objective ?? "(no objective)"
                          : `Localize → ${targetLocale?.toUpperCase() ?? ""} · ${
                              objective ? objective.slice(0, 60) : "..."
                            }`}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {r.kind === "copywriter" ? "Copywriter" : "Localizer"}
                        {r.voice && ` · ${r.voice.name}`}
                        {r.variants.length > 0 &&
                          ` · ${r.variants.length} variant${
                            r.variants.length === 1 ? "" : "s"
                          }`}
                      </p>
                    </div>
                    <Badge
                      variant={STATUS_VARIANT[r.status]}
                      className="text-[10px] tracking-wider"
                    >
                      {r.status}
                    </Badge>
                    <span className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                      {formatDistanceShort(r.createdAt)}
                    </span>
                    <ChevronRight className="h-3 w-3 text-[var(--color-muted-foreground)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
