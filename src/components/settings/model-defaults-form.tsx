"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Sparkles, FileText, Zap, Gavel } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  modelDisplayName,
  modelPricingLabel,
  type OpenRouterModel,
  SUGGESTED_DEFAULTS,
} from "@/lib/ai/openrouter-shared";
import { setModelDefault } from "@/server/actions/model-defaults";
import type { ModelRole } from "@/db/schema";

const ROLES: Array<{
  role: ModelRole;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: "planning",
    title: "Planning",
    description: "Analyzes briefs, decides angle and structure. Reasoning-heavy.",
    icon: Sparkles,
  },
  {
    role: "drafting",
    title: "Drafting",
    description: "Generates copy variants. Quality and voice fidelity matter most.",
    icon: FileText,
  },
  {
    role: "fast",
    title: "Fast",
    description: "Audits, refines, back-translates. Optimized for low latency.",
    icon: Zap,
  },
  {
    role: "critic",
    title: "Critic",
    description: "Voice auditor + cultural adapter. Strong instruction following.",
    icon: Gavel,
  },
];

interface ExistingDefault {
  role: ModelRole;
  modelId: string;
}

export function ModelDefaultsForm({
  existing,
  hasKey,
}: {
  existing: ExistingDefault[];
  hasKey: boolean;
}) {
  const [models, setModels] = React.useState<OpenRouterModel[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/openrouter/models", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { models: OpenRouterModel[] };
        if (!cancelled) setModels(json.models);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const map = new Map(existing.map((e) => [e.role, e.modelId]));

  return (
    <div className="flex flex-col gap-3">
      {!hasKey && (
        <p className="rounded-md border border-dashed border-[--color-border] bg-[--color-muted]/50 px-4 py-3 text-sm text-[--color-muted-foreground]">
          Add your OpenRouter key first — model picker uses it to fetch live
          pricing and availability.
        </p>
      )}
      {err && (
        <p className="rounded-md border border-[--color-destructive]/30 bg-[--color-destructive]/5 px-4 py-3 text-sm text-[--color-destructive]">
          Couldn&apos;t load models: {err}
        </p>
      )}
      <div className="grid gap-3">
        {ROLES.map((r) => (
          <RolePicker
            key={r.role}
            role={r.role}
            title={r.title}
            description={r.description}
            icon={r.icon}
            models={models}
            loading={loading}
            current={map.get(r.role) ?? SUGGESTED_DEFAULTS[r.role]}
          />
        ))}
      </div>
    </div>
  );
}

function RolePicker({
  role,
  title,
  description,
  icon: Icon,
  models,
  loading,
  current,
}: {
  role: ModelRole;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  models: OpenRouterModel[] | null;
  loading: boolean;
  current: string | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = React.useState<string>(current ?? "");

  React.useEffect(() => {
    if (current) setValue(current);
  }, [current]);

  const onChange = (next: string) => {
    setValue(next);
    startTransition(async () => {
      try {
        await setModelDefault({ role, modelId: next, provider: "openrouter" });
        toast.success(`${title} model set.`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  const selected = models?.find((m) => m.id === value);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[--color-border] bg-[--color-card] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[--color-primary]/10 text-[--color-primary]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium tracking-tight">{title}</p>
          {pending && (
            <Loader2 className="h-3 w-3 animate-spin text-[--color-muted-foreground]" />
          )}
        </div>
        <p className="text-xs text-[--color-muted-foreground] line-clamp-1">
          {description}
        </p>
      </div>
      <div className="w-[280px] shrink-0">
        {loading && !models ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select value={value} onValueChange={onChange} disabled={!models}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a model" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {models?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex flex-col">
                    <span className="text-sm">{modelDisplayName(m)}</span>
                    <span className="text-[10px] font-mono text-[--color-muted-foreground]">
                      {m.id}
                      {modelPricingLabel(m) ? ` · ${modelPricingLabel(m)}` : ""}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selected && modelPricingLabel(selected) && (
          <p className="mt-1 text-right text-[10px] font-mono text-[--color-muted-foreground]">
            {modelPricingLabel(selected)}
          </p>
        )}
      </div>
    </div>
  );
}
