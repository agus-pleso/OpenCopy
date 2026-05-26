"use client";

/**
 * audience-card — one audience entry on the profile page. ICP, demographics,
 * pain points, JTBD, decision criteria.
 */

import { Users } from "lucide-react";

import type { BrandProfileAudience } from "@/db/schema";
import { cn } from "@/lib/utils";

interface Props {
  audience: BrandProfileAudience;
  className?: string;
}

export function AudienceCard({ audience, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            <Users className="h-3 w-3" /> Audience
          </div>
          <h3 className="mt-1 font-display text-lg tracking-tight">{audience.name}</h3>
        </div>
      </header>

      {audience.demographics && (
        <p className="mt-3 text-sm text-pretty leading-relaxed text-[var(--color-foreground)]/85">
          {audience.demographics}
        </p>
      )}
      {audience.psychographics && (
        <p className="mt-2 text-sm text-pretty leading-relaxed text-[var(--color-muted-foreground)]">
          {audience.psychographics}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {audience.painPoints.length > 0 && (
          <ListBlock label="Pain points" items={audience.painPoints} />
        )}
        {audience.jobsToBeDone.length > 0 && (
          <ListBlock label="Jobs to be done" items={audience.jobsToBeDone} />
        )}
        {audience.decisionCriteria.length > 0 && (
          <ListBlock label="Decision criteria" items={audience.decisionCriteria} />
        )}
      </div>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <ul className="mt-1.5 space-y-1 text-xs leading-snug">
        {items.slice(0, 5).map((it, i) => (
          <li
            key={i}
            className="rounded-md bg-[var(--color-muted)]/40 px-2 py-1 text-pretty"
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
