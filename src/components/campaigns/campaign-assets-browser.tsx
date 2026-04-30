"use client";

import * as React from "react";
import {
  Megaphone,
  Mail,
  FileText,
  MessageSquare,
  Type,
  PanelTop,
  Package,
  Layers,
  Sparkles,
  ChevronRight,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";
import { AssetCard } from "./asset-card";
import type { CampaignAsset, Channel } from "@/db/schema";

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ad: { label: "Ads", icon: Megaphone },
  email: { label: "Email", icon: Mail },
  landing: { label: "Landing", icon: PanelTop },
  social: { label: "Social", icon: MessageSquare },
  blog: { label: "Blog", icon: FileText },
  headline: { label: "Headlines", icon: Type },
  product_description: { label: "Product", icon: Package },
  other: { label: "Other", icon: FileText },
};

type Filter = "all" | "saved" | Channel;

interface Props {
  assets: CampaignAsset[];
  requestedChannels: Channel[];
}

/**
 * Channel tabs + collapsed list of assets that expand inline on click.
 * Only one asset is open at a time so the page stays scannable.
 */
export function CampaignAssetsBrowser({ assets, requestedChannels }: Props) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Counts for the tab strip.
  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: assets.length, saved: 0 };
    for (const a of assets) {
      c[a.channel] = (c[a.channel] ?? 0) + 1;
      if (a.status === "saved") c.saved += 1;
    }
    return c;
  }, [assets]);

  // Channels that actually appear in the assets, ordered by the brief's
  // requested order first, then any unexpected channels at the end.
  const channelOrder = React.useMemo(() => {
    const seen = new Set<Channel>();
    const ordered: Channel[] = [];
    for (const c of requestedChannels) {
      if (counts[c] && !seen.has(c)) {
        ordered.push(c);
        seen.add(c);
      }
    }
    for (const a of assets) {
      if (!seen.has(a.channel)) {
        ordered.push(a.channel);
        seen.add(a.channel);
      }
    }
    return ordered;
  }, [assets, requestedChannels, counts]);

  const filtered = React.useMemo(() => {
    if (filter === "all") return assets;
    if (filter === "saved") return assets.filter((a) => a.status === "saved");
    return assets.filter((a) => a.channel === filter);
  }, [assets, filter]);

  // If the open asset is filtered out, collapse it.
  React.useEffect(() => {
    if (openId && !filtered.some((a) => a.id === openId)) setOpenId(null);
  }, [filter, filtered, openId]);

  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        No assets yet — drafters are still running.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] pb-px">
        <Tab
          active={filter === "all"}
          onClick={() => setFilter("all")}
          icon={Layers}
          label="All"
          count={counts.all}
        />
        {channelOrder.map((c) => {
          const meta = CHANNEL_META[c];
          return (
            <Tab
              key={c}
              active={filter === c}
              onClick={() => setFilter(c)}
              icon={meta.icon}
              label={meta.label}
              count={counts[c]}
            />
          );
        })}
        {counts.saved > 0 && (
          <Tab
            active={filter === "saved"}
            onClick={() => setFilter("saved")}
            icon={Sparkles}
            label="Saved"
            count={counts.saved}
            tone="success"
          />
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <li className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/20 p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Nothing in this filter.
          </li>
        ) : (
          filtered.map((asset) => (
            <li key={asset.id}>
              <AssetEntry
                asset={asset}
                expanded={openId === asset.id}
                onToggle={() =>
                  setOpenId(openId === asset.id ? null : asset.id)
                }
              />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone?: "success";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition",
        active
          ? "text-[var(--color-foreground)]"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
      )}
      aria-pressed={active}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          tone === "success" && "text-[var(--color-success)]",
        )}
      />
      <span className="tracking-tight font-medium">{label}</span>
      <span className="ml-0.5 rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-[var(--color-muted-foreground)]">
        {count}
      </span>
      {active && (
        <span className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 bg-[var(--color-primary)]" />
      )}
    </button>
  );
}

function AssetEntry({
  asset,
  expanded,
  onToggle,
}: {
  asset: CampaignAsset;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (expanded) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="self-start text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
        >
          ← Collapse
        </button>
        <AssetCard asset={asset} />
      </div>
    );
  }
  return <CompactAssetRow asset={asset} onExpand={onToggle} />;
}

function CompactAssetRow({
  asset,
  onExpand,
}: {
  asset: CampaignAsset;
  onExpand: () => void;
}) {
  const meta = CHANNEL_META[asset.channel];
  const Icon = meta.icon;

  const score = asset.auditScore;
  const tier =
    score == null
      ? null
      : score >= 90
        ? { label: "On-brand", tint: "success" as const }
        : score >= 70
          ? { label: "Light edits", tint: "warning" as const }
          : { label: "Off-brand", tint: "destructive" as const };

  const tintBg =
    tier?.tint === "success"
      ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
      : tier?.tint === "warning"
        ? "bg-[var(--color-warning)]/12 text-[var(--color-warning)]"
        : tier?.tint === "destructive"
          ? "bg-[var(--color-destructive)]/12 text-[var(--color-destructive)]"
          : "";

  // First line of content as a preview, capped.
  const preview = React.useMemo(() => {
    const firstLine = asset.content.split("\n").find((l) => l.trim()) ?? "";
    return firstLine.length > 140 ? firstLine.slice(0, 140) + "…" : firstLine;
  }, [asset.content]);

  if (asset.status === "discarded") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-2.5 text-sm text-[var(--color-muted-foreground)]"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>Discarded · {asset.label}</span>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        layout
        onClick={onExpand}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="group flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-left transition hover:border-[var(--color-primary)]/40 hover:shadow-sm"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              {meta.label}
            </span>
            <span className="truncate font-medium tracking-tight">
              {asset.label}
            </span>
            {asset.status === "saved" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-[var(--color-success)]">
                <Check className="h-2.5 w-2.5" /> Saved
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted-foreground)]">
            {preview || "(empty)"}
          </p>
        </div>

        {tier && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              tintBg,
            )}
            title={tier.label}
          >
            <span className="font-mono">{score}</span>
          </span>
        )}

        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
      </motion.button>
    </AnimatePresence>
  );
}
