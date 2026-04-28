import { Bot, Languages, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AgentsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[--color-muted-foreground]">
            Agents
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Multi-agent flows that show their work.
          </h1>
        </div>
        <Badge variant="muted">V1.0</Badge>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <AgentCard
          icon={Bot}
          name="Copywriter"
          description="Brief → strategy → multiple drafts → voice audit → refined output. Variants stream side-by-side."
          steps={["Planner", "Drafters (×N parallel)", "Voice Auditor", "Refiner"]}
        />
        <AgentCard
          icon={Languages}
          name="Localizer"
          description="Source → cultural adaptation → transcreation → back-translation → voice audit. Hover any line for the why."
          steps={[
            "Cultural Adapter",
            "Localizer (PL · EN · RO · UA)",
            "Back-Translator",
            "Voice Auditor",
          ]}
        />
      </div>

      <div className="mt-10 flex items-center gap-3 rounded-lg border border-dashed border-[--color-border] bg-[--color-muted]/40 px-5 py-4 text-sm text-[--color-muted-foreground]">
        <Workflow className="h-4 w-4 text-[--color-primary]" />
        <span>
          Both agents land in V1.0. The orchestration scaffold and OpenRouter
          gateway are already in place — V0.2 wires up brand voices, then we
          build these flows on top.
        </span>
      </div>
    </div>
  );
}

function AgentCard({
  icon: Icon,
  name,
  description,
  steps,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  steps: string[];
}) {
  return (
    <div className="rounded-xl border border-[--color-border] bg-[--color-card] p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="font-display text-xl tracking-tight">{name}</h2>
      </div>
      <p className="mt-3 text-sm text-[--color-muted-foreground] text-pretty">
        {description}
      </p>
      <ol className="mt-5 flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li
            key={i}
            className="flex items-center gap-3 text-sm"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[--color-border] text-[10px] font-medium text-[--color-muted-foreground]">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
