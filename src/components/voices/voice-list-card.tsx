import Link from "next/link";
import { ScanText, Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDistanceShort } from "@/lib/utils";
import type { BrandVoice } from "@/db/schema";

interface Props {
  voice: BrandVoice & { sampleCount: number };
}

const STATUS_VARIANT: Record<
  BrandVoice["status"],
  "success" | "muted" | "outline"
> = {
  active: "success",
  draft: "muted",
  archived: "outline",
};

const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  pl: "PL",
  ro: "RO",
  uk: "UA",
};

export function VoiceListCard({ voice }: Props) {
  const isAnalyzed = !!voice.analyzedAt;
  return (
    <Link
      href={`/voices/${voice.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        "transition hover:border-[var(--color-primary)]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <ScanText className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] tracking-wider">
            {LOCALE_LABEL[voice.defaultLocale] ?? voice.defaultLocale.toUpperCase()}
          </Badge>
          <Badge variant={STATUS_VARIANT[voice.status]} className="text-[10px] tracking-wider">
            {voice.status}
          </Badge>
        </div>
      </div>

      <div className="min-h-[3rem]">
        <h3 className="font-display text-lg tracking-tight line-clamp-1">
          {voice.name}
        </h3>
        {voice.description && (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2 text-pretty">
            {voice.description}
          </p>
        )}
      </div>

      {voice.toneDescriptors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {voice.toneDescriptors.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[11px] font-medium tracking-tight"
            >
              {t}
            </span>
          ))}
          {voice.toneDescriptors.length > 4 && (
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              +{voice.toneDescriptors.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-[var(--color-border)]/60 pt-3 text-xs text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3 w-3" /> {voice.sampleCount} sample
          {voice.sampleCount === 1 ? "" : "s"}
        </span>
        {isAnalyzed ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-[var(--color-primary)]" />
            Analyzed
          </span>
        ) : (
          <span className="text-[var(--color-warning)]">Awaiting analysis</span>
        )}
        <span className="ml-auto">{formatDistanceShort(voice.updatedAt)}</span>
      </div>
    </Link>
  );
}
