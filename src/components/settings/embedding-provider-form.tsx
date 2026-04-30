"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Server, Cloud, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMBEDDING_MODELS,
  type EmbeddingProviderId,
} from "@/lib/ai/embeddings-shared";
import { saveEmbeddingPreference } from "@/server/actions/embeddings-config";

interface Props {
  current: { provider: EmbeddingProviderId; modelId: string };
  hasOpenAIKey: boolean;
  hasOllamaConfigured: boolean;
}

const PROVIDER_DESCRIPTIONS: Record<
  Exclude<EmbeddingProviderId, "voyage">,
  { label: string; blurb: string; icon: React.ComponentType<{ className?: string }> }
> = {
  openai: {
    label: "OpenAI (cloud, paid)",
    blurb: "Best multilingual quality. Requires an OpenAI API key.",
    icon: Cloud,
  },
  ollama: {
    label: "Ollama (local, free, open source)",
    blurb:
      "Runs entirely on your machine. Pull the embedding model with `ollama pull <model>` first.",
    icon: Server,
  },
};

export function EmbeddingProviderForm({
  current,
  hasOpenAIKey,
  hasOllamaConfigured,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = React.useState<Exclude<
    EmbeddingProviderId,
    "voyage"
  >>(current.provider === "voyage" ? "openai" : current.provider);
  const [modelId, setModelId] = React.useState(current.modelId);

  const modelsForProvider = React.useMemo(
    () => EMBEDDING_MODELS.filter((m) => m.provider === provider),
    [provider],
  );

  const onProviderChange = (next: string) => {
    const p = next as Exclude<EmbeddingProviderId, "voyage">;
    setProvider(p);
    const first = EMBEDDING_MODELS.find((m) => m.provider === p);
    if (first) setModelId(first.id);
  };

  const onSave = () => {
    startTransition(async () => {
      const res = await saveEmbeddingPreference({ provider, modelId });
      if (res.ok) {
        toast.success(
          res.dimensions
            ? `Saved. Verified ${modelId} returns ${res.dimensions}-dim vectors.`
            : "Embedding preference saved.",
        );
      } else {
        toast.error(res.message ?? "Could not save preference.");
      }
    });
  };

  const isUnchanged =
    provider === current.provider && modelId === current.modelId;
  const cantUseProvider =
    (provider === "openai" && !hasOpenAIKey) ||
    (provider === "ollama" && !hasOllamaConfigured);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium tracking-tight">
          Embedding provider
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)] text-pretty">
          Pick where vectors come from. Switching the provider mid-flight means
          existing knowledge sources need to be re-indexed before they can be
          searched again.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(["openai", "ollama"] as const).map((p) => {
          const meta = PROVIDER_DESCRIPTIONS[p];
          const Icon = meta.icon;
          const selected = provider === p;
          const disabled =
            (p === "openai" && !hasOpenAIKey) ||
            (p === "ollama" && !hasOllamaConfigured);
          return (
            <button
              key={p}
              type="button"
              onClick={() => !disabled && onProviderChange(p)}
              disabled={disabled}
              className={
                selected
                  ? "relative flex flex-col gap-1.5 rounded-lg border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-3 text-left"
                  : "relative flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-left transition hover:border-[var(--color-primary)]/40 disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                <span className="text-sm font-medium tracking-tight">
                  {meta.label}
                </span>
                {selected && (
                  <Check className="ml-auto h-4 w-4 text-[var(--color-primary)]" />
                )}
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] text-pretty">
                {meta.blurb}
              </p>
              {disabled && (
                <p className="text-[11px] text-[var(--color-warning)]">
                  {p === "openai"
                    ? "Add an OpenAI key above."
                    : "Configure Ollama in the AI providers section above."}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Model
        </p>
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelsForProvider.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col">
                  <span className="text-sm">{m.label}</span>
                  <span className="text-[10px] font-mono text-[var(--color-muted-foreground)]">
                    {m.dimensions}d native
                    {m.local
                      ? " · zero-padded to 1536"
                      : m.pricePer1MTokens
                      ? ` · $${m.pricePer1MTokens}/1M tok`
                      : ""}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {provider === "ollama" && (
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Run{" "}
            <code className="font-mono">
              ollama pull {modelId}
            </code>{" "}
            on the machine where Ollama is running before saving.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={onSave}
          disabled={pending || isUnchanged || cantUseProvider}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save preference
        </Button>
      </div>
    </div>
  );
}
