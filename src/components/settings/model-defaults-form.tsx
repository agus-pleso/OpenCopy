"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Sparkles, FileText, Zap, Gavel, Server } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  modelPricingLabel,
  type OpenRouterModel,
  SUGGESTED_DEFAULTS,
} from "@/lib/ai/openrouter-shared";
import {
  PROVIDER_PRICING,
  PROVIDER_LABELS,
} from "@/lib/ai/model-pricing";
import { setModelDefault } from "@/server/actions/model-defaults";
import { ModelPicker } from "./model-picker";
import type { ApiKeyProvider, ModelRole } from "@/db/schema";

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
  provider: ApiKeyProvider;
}

export interface ConnectedProviders {
  openrouter: boolean;
  anthropic: boolean;
  openai: boolean;
  google: boolean;
  mistral: boolean;
  ollama: boolean;
}

interface Props {
  existing: ExistingDefault[];
  hasKey: boolean;
  connectedProviders: ConnectedProviders;
}

export function ModelDefaultsForm({
  existing,
  hasKey,
  connectedProviders,
}: Props) {
  const [models, setModels] = React.useState<OpenRouterModel[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!connectedProviders.openrouter) return;
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
  }, [connectedProviders.openrouter]);

  const map = new Map(existing.map((e) => [e.role, e]));

  return (
    <div className="flex flex-col gap-3">
      {!hasKey && (
        <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/50 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
          Add your OpenRouter key first — the model picker uses it to fetch live
          pricing. Direct providers can still be used by selecting them per-role
          and entering a model id.
        </p>
      )}
      {err && (
        <p className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-4 py-3 text-sm text-[var(--color-destructive)]">
          Couldn&apos;t load OpenRouter models: {err}
        </p>
      )}
      <div className="grid gap-3">
        {ROLES.map((r) => {
          const current = map.get(r.role);
          return (
            <RolePicker
              key={r.role}
              role={r.role}
              title={r.title}
              description={r.description}
              icon={r.icon}
              models={models}
              loading={loading}
              currentModelId={current?.modelId ?? SUGGESTED_DEFAULTS[r.role]}
              currentProvider={current?.provider ?? "openrouter"}
              connectedProviders={connectedProviders}
            />
          );
        })}
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
  currentModelId,
  currentProvider,
  connectedProviders,
}: {
  role: ModelRole;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  models: OpenRouterModel[] | null;
  loading: boolean;
  currentModelId: string | undefined;
  currentProvider: ApiKeyProvider;
  connectedProviders: ConnectedProviders;
}) {
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = React.useState<ApiKeyProvider>(currentProvider);
  const [modelId, setModelId] = React.useState<string>(currentModelId ?? "");

  React.useEffect(() => {
    if (currentProvider) setProvider(currentProvider);
    if (currentModelId) setModelId(currentModelId);
  }, [currentProvider, currentModelId]);

  const persist = (nextProvider: ApiKeyProvider, nextModelId: string) => {
    if (!nextModelId.trim()) return;
    startTransition(async () => {
      try {
        await setModelDefault({
          role,
          modelId: nextModelId.trim(),
          provider: nextProvider,
        });
        toast.success(`${title} model set.`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  const onProviderChange = (next: string) => {
    const p = next as ApiKeyProvider;
    setProvider(p);
    // Suggest a sensible default for the new provider.
    const suggested = suggestModelForProvider(p);
    if (suggested) {
      setModelId(suggested);
      persist(p, suggested);
    } else {
      // Persist the provider change with the existing modelId — user will tweak.
      persist(p, modelId);
    }
  };

  const onOpenRouterModel = (next: string) => {
    setModelId(next);
    persist("openrouter", next);
  };

  const onDirectModel = (next: string) => {
    setModelId(next);
  };

  const onDirectModelBlur = () => {
    persist(provider, modelId);
  };

  const availableProviders: ApiKeyProvider[] = (
    [
      "openrouter",
      "anthropic",
      "openai",
      "google",
      "mistral",
      "ollama",
    ] satisfies ApiKeyProvider[]
  ).filter((p) => connectedProviders[p]);

  const selectedOR = models?.find((m) => m.id === modelId);
  const directHints =
    provider !== "openrouter"
      ? PROVIDER_PRICING[provider as Exclude<ApiKeyProvider, "openrouter">]
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 md:flex-row md:items-start">
      <div className="flex flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium tracking-tight">{title}</p>
            {pending && (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--color-muted-foreground)]" />
            )}
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)] line-clamp-1">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 md:w-[180px]">
        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((p) => (
              <SelectItem key={p} value={p}>
                {PROVIDER_LABELS[p]}
                {p === "ollama" && (
                  <Server className="ml-2 inline h-3 w-3 text-[var(--color-muted-foreground)]" />
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5 md:w-[280px]">
        {provider === "openrouter" ? (
          <>
            {loading && !models ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <ModelPicker
                models={models ?? []}
                value={modelId}
                onChange={onOpenRouterModel}
                disabled={!models}
              />
            )}
            {selectedOR && modelPricingLabel(selectedOR) && (
              <p className="text-right text-[10px] font-mono text-[var(--color-muted-foreground)]">
                {modelPricingLabel(selectedOR)}
              </p>
            )}
          </>
        ) : (
          <>
            <Input
              value={modelId}
              onChange={(e) => onDirectModel(e.target.value)}
              onBlur={onDirectModelBlur}
              placeholder={
                provider === "ollama"
                  ? "e.g. llama3.1:8b"
                  : "Provider-native model id"
              }
              className="h-9 font-mono text-xs"
            />
            {directHints && directHints.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {directHints.slice(0, 4).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setModelId(h.id);
                      persist(provider, h.id);
                    }}
                    className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-mono hover:bg-[var(--color-accent)]"
                  >
                    {h.id}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function suggestModelForProvider(p: ApiKeyProvider): string | null {
  switch (p) {
    case "anthropic":
      return "claude-sonnet-4-6-20251104";
    case "openai":
      return "gpt-4.1";
    case "google":
      return "gemini-2.0-flash";
    case "mistral":
      return "mistral-large-latest";
    case "ollama":
      return "llama3.1:8b";
    case "openrouter":
      return null;
  }
}
