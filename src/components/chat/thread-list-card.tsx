import Link from "next/link";
import { MessageSquare, Pin, ScanText } from "lucide-react";
import { cn, formatDistanceShort } from "@/lib/utils";
import type { ThreadListItem } from "@/server/actions/chat";

interface Props {
  thread: ThreadListItem & { voice?: { id: string; name: string } | null };
}

export function ThreadListCard({ thread }: Props) {
  return (
    <Link
      href={`/chat/${thread.id}`}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        "transition hover:border-[var(--color-primary)]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <MessageSquare className="h-4 w-4" />
        </div>
        {thread.pinned && <Pin className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
      </div>
      <h3 className="font-display text-base tracking-tight line-clamp-2">
        {thread.title}
      </h3>
      {thread.lastMessagePreview && (
        <p
          className="text-sm text-[var(--color-muted-foreground)] line-clamp-3 text-pretty"
          style={{ fontFamily: "ui-serif, Georgia, serif" }}
        >
          {thread.lastMessagePreview}
        </p>
      )}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--color-border)]/60 pt-3 text-xs text-[var(--color-muted-foreground)]">
        {thread.voice && (
          <span className="inline-flex items-center gap-1">
            <ScanText className="h-3 w-3" />
            {thread.voice.name}
          </span>
        )}
        <span className="ml-auto">{formatDistanceShort(thread.updatedAt)}</span>
      </div>
    </Link>
  );
}
