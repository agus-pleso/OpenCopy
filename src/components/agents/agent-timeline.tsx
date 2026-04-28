import { CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentRunStep } from "@/db/schema";

const AGENT_LABELS: Record<string, { label: string; tone: "plan" | "draft" | "audit" }> = {
  "copywriter-planner": { label: "Planner", tone: "plan" },
  "copywriter-drafter": { label: "Drafter", tone: "draft" },
  "copywriter-refiner": { label: "Refiner", tone: "draft" },
  "voice-auditor": { label: "Voice Auditor", tone: "audit" },
  "localizer-cultural-adapter": { label: "Cultural Adapter", tone: "plan" },
  "localizer-transcreator": { label: "Localizer", tone: "draft" },
  "localizer-back-translator": { label: "Back-Translator", tone: "draft" },
};

const TONE_COLOR = {
  plan: "bg-[--color-primary]/15 text-[--color-primary]",
  draft: "bg-[--color-success]/15 text-[--color-success]",
  audit: "bg-[--color-warning]/15 text-[--color-warning]",
};

export function AgentTimeline({ steps }: { steps: AgentRunStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-[--color-muted-foreground]">
        No timeline yet — agents are starting up.
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-3">
      <span
        className="absolute left-[15px] top-3 bottom-3 w-px bg-[--color-border]"
        aria-hidden
      />
      {steps.map((s) => {
        const meta =
          AGENT_LABELS[s.agentName] ?? {
            label: s.agentName,
            tone: "draft" as const,
          };
        const Icon =
          s.status === "succeeded"
            ? CheckCircle2
            : s.status === "failed"
            ? AlertCircle
            : s.status === "running"
            ? Loader2
            : Circle;
        const iconColor =
          s.status === "succeeded"
            ? "text-[--color-success]"
            : s.status === "failed"
            ? "text-[--color-destructive]"
            : s.status === "running"
            ? "text-[--color-primary]"
            : "text-[--color-muted-foreground]";
        const animateClass = s.status === "running" ? "animate-spin" : "";

        return (
          <li key={s.id} className="relative flex items-start gap-3 pl-0">
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[--color-background] bg-[--color-background]",
              )}
            >
              <Icon className={cn("h-4 w-4", iconColor, animateClass)} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                    TONE_COLOR[meta.tone],
                  )}
                >
                  {meta.tone}
                </span>
                <p className="text-sm font-medium tracking-tight">
                  {meta.label}
                </p>
                {s.durationMs != null && (
                  <span className="ml-auto text-[11px] tabular-nums text-[--color-muted-foreground]">
                    {(s.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              {s.modelId && (
                <p className="text-[11px] font-mono text-[--color-muted-foreground] truncate">
                  {s.modelId}
                </p>
              )}
              {s.error && (
                <p className="mt-1 text-xs text-[--color-destructive]">
                  {s.error}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
