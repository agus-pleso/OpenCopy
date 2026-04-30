"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  modelDisplayName,
  modelPricingLabel,
  type OpenRouterModel,
} from "@/lib/ai/openrouter-shared";

interface Props {
  models: OpenRouterModel[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

type Tier = "all" | "free" | "paid";

const TIER_LABELS: Record<Tier, string> = {
  all: "All",
  free: "Free",
  paid: "Paid",
};

function vendorOf(modelId: string): string {
  const i = modelId.indexOf("/");
  return i > 0 ? modelId.slice(0, i) : modelId;
}

function vendorLabel(vendor: string): string {
  if (vendor === "anthropic") return "Anthropic";
  if (vendor === "openai") return "OpenAI";
  if (vendor === "google") return "Google";
  if (vendor === "mistralai") return "Mistral";
  if (vendor === "meta-llama") return "Meta";
  if (vendor === "deepseek") return "DeepSeek";
  if (vendor === "qwen") return "Qwen";
  if (vendor === "x-ai") return "xAI";
  return vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

function isFreeModel(m: OpenRouterModel): boolean {
  const p = m.pricing;
  if (!p) return false;
  const promptZero = p.prompt === undefined || Number(p.prompt) === 0;
  const completionZero = p.completion === undefined || Number(p.completion) === 0;
  return promptZero && completionZero;
}

export function ModelPicker({ models, value, onChange, disabled }: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("all");
  const [vendor, setVendor] = React.useState<string>("all");

  const vendors = React.useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => set.add(vendorOf(m.id)));
    return Array.from(set).sort();
  }, [models]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (vendor !== "all" && vendorOf(m.id) !== vendor) return false;
      if (tier === "free" && !isFreeModel(m)) return false;
      if (tier === "paid" && isFreeModel(m)) return false;
      if (!q) return true;
      const name = modelDisplayName(m).toLowerCase();
      return m.id.toLowerCase().includes(q) || name.includes(q);
    });
  }, [models, query, vendor, tier]);

  const selected = models.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-left text-sm shadow-sm transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-background)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className="min-w-0 truncate">
            {selected ? modelDisplayName(selected) : value || "Pick a model"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <Search className="h-3.5 w-3.5 opacity-60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <div className="flex items-center gap-1">
            {(["all", "free", "paid"] as Tier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs transition",
                  tier === t
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
                )}
              >
                {TIER_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setVendor("all")}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] transition",
                vendor === "all"
                  ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                  : "border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
              )}
            >
              All providers
            </button>
            {vendors.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVendor(v)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] transition",
                  vendor === v
                    ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                    : "border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
                )}
              >
                {vendorLabel(v)}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
              No models match these filters.
            </p>
          ) : (
            filtered.map((m) => {
              const isSelected = m.id === value;
              const free = isFreeModel(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition",
                    isSelected
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                      : "hover:bg-[var(--color-muted)]",
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">
                        {modelDisplayName(m)}
                      </span>
                      {free && (
                        <span className="rounded-full bg-[var(--color-success)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-success)]">
                          Free
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] font-mono text-[var(--color-muted-foreground)]">
                      {m.id}
                      {modelPricingLabel(m) ? ` · ${modelPricingLabel(m)}` : ""}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
