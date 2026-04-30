import Link from "next/link";
import { FileText, ScanText } from "lucide-react";
import { cn, formatDistanceShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Document } from "@/db/schema";

const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  pl: "PL",
  ro: "RO",
  uk: "UA",
};

interface Props {
  document: Document & { voice?: { id: string; name: string } | null };
}

export function DocumentListCard({ document }: Props) {
  const wordCount = document.wordCount ?? 0;
  const preview =
    document.contentText.trim().slice(0, 240).replace(/\s+/g, " ") ||
    "Empty document — start writing.";

  return (
    <Link
      href={`/documents/${document.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        "transition hover:border-[var(--color-primary)]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-1.5">
          {document.voice && (
            <Badge variant="outline" className="inline-flex items-center gap-1 text-[10px] tracking-wider">
              <ScanText className="h-2.5 w-2.5" />
              {document.voice.name}
            </Badge>
          )}
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {LOCALE_LABEL[document.locale] ?? document.locale.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="min-h-[3rem]">
        <h3 className="font-display text-lg tracking-tight line-clamp-1">
          {document.title || "Untitled"}
        </h3>
        <p
          className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-3 text-pretty"
          style={{ fontFamily: "ui-serif, Georgia, serif" }}
        >
          {preview}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-[var(--color-border)]/60 pt-3 text-xs text-[var(--color-muted-foreground)]">
        <span className="tabular-nums">
          {wordCount.toLocaleString()} word{wordCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto">{formatDistanceShort(document.updatedAt)}</span>
      </div>
    </Link>
  );
}
