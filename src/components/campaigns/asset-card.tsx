"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Copy,
  Check,
  Sparkles,
  Trash2,
  AlertCircle,
  ChevronDown,
  Loader2,
  Megaphone,
  Mail,
  FileText,
  MessageSquare,
  Type,
  PanelTop,
  Package,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/exports/export-button";
import { cn } from "@/lib/utils";
import {
  saveCampaignAsset,
  discardCampaignAsset,
} from "@/server/actions/campaigns";
import type { CampaignAsset, Channel } from "@/db/schema";
import type { VoiceAuditIssue } from "@/lib/agents";

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ad: { label: "Ad", icon: Megaphone },
  email: { label: "Email", icon: Mail },
  landing: { label: "Landing", icon: PanelTop },
  social: { label: "Social", icon: MessageSquare },
  blog: { label: "Blog", icon: FileText },
  headline: { label: "Headline", icon: Type },
  product_description: { label: "Product", icon: Package },
  other: { label: "Other", icon: FileText },
};

const SEV_COLOR: Record<VoiceAuditIssue["severity"], string> = {
  high: "text-[var(--color-destructive)]",
  medium: "text-[var(--color-warning)]",
  low: "text-[var(--color-muted-foreground)]",
};

interface Props {
  asset: CampaignAsset;
}

export function AssetCard({ asset: initial }: Props) {
  const [asset, setAsset] = React.useState(initial);
  const [pendingSave, startSave] = useTransition();
  const [pendingDiscard, startDiscard] = useTransition();
  const [expanded, setExpanded] = React.useState(false);

  const meta = CHANNEL_META[asset.channel];
  const Icon = meta.icon;
  const issues = (asset.auditIssues ?? []) as VoiceAuditIssue[];
  const score = asset.auditScore;

  const tier = score == null
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

  const onCopy = () => {
    navigator.clipboard.writeText(asset.content);
    toast.success("Copied.");
  };

  const onSave = () => {
    startSave(async () => {
      await saveCampaignAsset(asset.id);
      setAsset({ ...asset, status: "saved", savedAt: new Date() });
      toast.success("Saved to library.");
    });
  };

  const onDiscard = () => {
    startDiscard(async () => {
      await discardCampaignAsset(asset.id);
      setAsset({ ...asset, status: "discarded" });
      toast.success("Discarded.");
    });
  };

  if (asset.status === "discarded") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
        <Trash2 className="h-4 w-4" />
        <span>
          Discarded · {meta.label} — {asset.label}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
    >
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {meta.label}
        </span>
        <h3 className="font-display text-base tracking-tight line-clamp-1">
          {asset.label}
        </h3>
        {asset.status === "saved" && (
          <Badge variant="success" className="text-[10px] tracking-wider">
            Saved
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {tier && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                tintBg,
              )}
            >
              <span className="font-mono">{score}</span>
              <span className="opacity-70">·</span>
              <span>{tier.label}</span>
            </span>
          )}
        </div>
      </div>

      {asset.strategy && (
        <p className="border-b border-[var(--color-border)]/60 bg-[var(--color-muted)]/30 px-5 py-2 text-xs uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
          Angle ·{" "}
          <span className="normal-case tracking-normal text-[var(--color-foreground)]">
            {asset.strategy}
          </span>
        </p>
      )}

      <article
        className="prose-sm whitespace-pre-wrap px-5 py-5 text-[15px] leading-relaxed font-serif text-pretty"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      >
        {asset.content}
      </article>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <ExportButton kind="variant" id={asset.id} variant="ghost" label="" />
        {issues.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="gap-1.5"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {issues.length} issue{issues.length === 1 ? "" : "s"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {asset.status !== "saved" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={pendingDiscard}
              className="text-[var(--color-muted-foreground)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
          )}
          {asset.status !== "saved" && (
            <Button size="sm" onClick={onSave} disabled={pendingSave}>
              {pendingSave ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Save to library
            </Button>
          )}
          {asset.status === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && issues.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="bg-[var(--color-muted)]/30 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Audit · {asset.auditSummary}
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {issues
                  .slice()
                  .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
                  .map((issue, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] tracking-wider">
                          {issue.category.replace("_", " ")}
                        </Badge>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider",
                            SEV_COLOR[issue.severity],
                          )}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <blockquote className="mt-1.5 border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)]/40 px-2.5 py-1 text-sm italic">
                        &ldquo;{issue.excerpt}&rdquo;
                      </blockquote>
                      <p className="mt-1.5 text-pretty">{issue.explanation}</p>
                      {issue.suggestion && (
                        <p className="mt-1.5 rounded border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-2 py-1 text-pretty">
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-success)]">
                            Suggestion ·
                          </span>{" "}
                          {issue.suggestion}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function sevRank(s: VoiceAuditIssue["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}
