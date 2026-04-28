import Link from "next/link";
import { BookOpen, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { cn, formatDistanceShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { KbSource } from "@/db/schema";

const STATUS_VARIANT: Record<
  KbSource["status"],
  "success" | "warning" | "destructive" | "outline"
> = {
  ready: "success",
  indexing: "warning",
  failed: "destructive",
  archived: "outline",
};

interface Props {
  source: KbSource;
}

export function SourceListCard({ source }: Props) {
  const Icon = source.status === "failed" ? AlertTriangle : BookOpen;
  return (
    <Link
      href={`/knowledge/${source.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-[--color-border] bg-[--color-card] p-5",
        "transition hover:border-[--color-primary]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
          <Icon className="h-4 w-4" />
        </div>
        <Badge
          variant={STATUS_VARIANT[source.status]}
          className="text-[10px] tracking-wider"
        >
          {source.status === "indexing" && (
            <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
          )}
          {source.status}
        </Badge>
      </div>

      <div className="min-h-[3rem]">
        <h3 className="font-display text-lg tracking-tight line-clamp-1">
          {source.name}
        </h3>
        {source.description && (
          <p className="mt-1 text-sm text-[--color-muted-foreground] line-clamp-2 text-pretty">
            {source.description}
          </p>
        )}
      </div>

      {source.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {source.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-[--color-border] bg-[--color-muted] px-2 py-0.5 text-[10px] font-medium tracking-tight"
            >
              {t}
            </span>
          ))}
          {source.tags.length > 4 && (
            <span className="text-[10px] text-[--color-muted-foreground]">
              +{source.tags.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-[--color-border]/60 pt-3 text-xs text-[--color-muted-foreground]">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <FileText className="h-3 w-3" />
          {source.chunkCount} chunk{source.chunkCount === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">
          {source.tokenCount.toLocaleString()} tok
        </span>
        <span className="ml-auto">{formatDistanceShort(source.updatedAt)}</span>
      </div>
    </Link>
  );
}
