"use client";

/**
 * competitor-card — competitor row with positioning + why-they-win / why-we-win.
 */

import { ExternalLink, Swords } from "lucide-react";

import type { BrandProfileCompetitor } from "@/db/schema";
import { cn } from "@/lib/utils";

interface Props {
  competitor: BrandProfileCompetitor;
  className?: string;
}

export function CompetitorCard({ competitor, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            <Swords className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="font-display text-base tracking-tight">{competitor.name}</h3>
            {competitor.url && (
              <a
                href={competitor.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
              >
                {competitor.url.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </header>

      {competitor.positioning && (
        <p className="mt-3 text-sm text-pretty leading-relaxed text-[var(--color-foreground)]/85">
          {competitor.positioning}
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Defensive defaults: NL-command-added competitors arrive without
         *  whyTheyWin / whyWeWin populated (only name + id). The schema types
         *  them as required arrays for the post-onboarding case, but the
         *  Add-Competitor patch shape doesn't seed them — keep the render
         *  resilient to either shape rather than failing on undefined.length. */}
        {(competitor.whyTheyWin ?? []).length > 0 && (
          <Panel
            label="Why they win"
            tone="muted"
            items={competitor.whyTheyWin ?? []}
          />
        )}
        {(competitor.whyWeWin ?? []).length > 0 && (
          <Panel
            label="Why we win"
            tone="primary"
            items={competitor.whyWeWin ?? []}
          />
        )}
      </div>
    </div>
  );
}

function Panel({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "muted" | "primary";
  items: string[];
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "primary"
          ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5"
          : "border-[var(--color-border)] bg-[var(--color-muted)]/40",
      )}
    >
      <p
        className={cn(
          "text-[10px] uppercase tracking-[0.16em]",
          tone === "primary"
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-muted-foreground)]",
        )}
      >
        {label}
      </p>
      <ul className="mt-2 space-y-1 text-xs leading-snug">
        {items.slice(0, 6).map((it, i) => (
          <li key={i} className="text-pretty">
            <span className="mr-1.5 text-[var(--color-muted-foreground)]">•</span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
