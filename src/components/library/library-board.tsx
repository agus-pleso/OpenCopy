"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckSquare,
  Download,
  FileText,
  Filter,
  Languages,
  Library as LibraryIcon,
  MessageCircle,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LibraryCopyButton } from "@/components/library/library-copy-button";
import { formatDistanceShort } from "@/lib/utils";
import { bulkDeleteLibraryItems } from "@/server/actions/library";
import type {
  CopywriterBrief,
  LocalizerBrief,
} from "@/db/schema";
import type {
  LibraryChatMessageItem,
  LibraryDocumentSelectionItem,
  LibraryItem,
  LibraryVariantItem,
} from "@/server/actions/library";

const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  pl: "PL",
  ro: "RO",
  uk: "UA",
};

type KindFilter =
  | "all"
  | "copywriter"
  | "localizer"
  | "chat_message"
  | "document_selection";

interface Props {
  items: LibraryItem[];
}

export function LibraryBoard({ items }: Props) {
  const router = useRouter();
  const [kindFilter, setKindFilter] = React.useState<KindFilter>("all");
  const [voiceFilter, setVoiceFilter] = React.useState<string | "all">("all");
  const [localeFilter, setLocaleFilter] = React.useState<string | "all">("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = React.useState(false);

  const voices = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (it.voice) map.set(it.voice.id, it.voice.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const locales = React.useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(it.locale);
    return Array.from(set).sort();
  }, [items]);

  const filtered = items.filter((it) => {
    if (kindFilter !== "all") {
      if (kindFilter === "copywriter") {
        if (it.kind !== "variant" || it.runKind !== "copywriter") return false;
      } else if (kindFilter === "localizer") {
        if (it.kind !== "variant" || it.runKind !== "localizer") return false;
      } else if (it.kind !== kindFilter) {
        return false;
      }
    }
    if (voiceFilter !== "all" && it.voice?.id !== voiceFilter) return false;
    if (localeFilter !== "all" && it.locale !== localeFilter) return false;
    return true;
  });

  const anyFilterActive =
    kindFilter !== "all" || voiceFilter !== "all" || localeFilter !== "all";

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((it) => it.id)));
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    const variantIds: string[] = [];
    const entryIds: string[] = [];
    for (const it of items) {
      if (!selected.has(it.id)) continue;
      if (it.kind === "variant") variantIds.push(it.variantId);
      else entryIds.push(it.entryId);
    }
    if (
      !confirm(
        `Remove ${selected.size} item${selected.size === 1 ? "" : "s"} from the library?`,
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      await bulkDeleteLibraryItems({ variantIds, entryIds });
      clearSelection();
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mt-10" data-tour="library-list">
      <div
        className="flex flex-wrap items-center gap-2"
        data-tour="library-filters"
      >
        <Filter className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />

        <ChipDropdown
          label="Kind"
          value={labelForKind(kindFilter)}
          onSelect={(v) => setKindFilter(v as KindFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "copywriter", label: "Copywriter variants" },
            { value: "localizer", label: "Localizer variants" },
            { value: "chat_message", label: "Chat saves" },
            { value: "document_selection", label: "Document selections" },
          ]}
        />

        {voices.length > 1 && (
          <ChipDropdown
            label="Voice"
            value={
              voiceFilter === "all"
                ? "All"
                : voices.find((v) => v.id === voiceFilter)?.name ?? "Voice"
            }
            onSelect={setVoiceFilter}
            options={[
              { value: "all", label: "All voices" },
              ...voices.map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
        )}

        {locales.length > 1 && (
          <ChipDropdown
            label="Locale"
            value={
              localeFilter === "all"
                ? "All"
                : LOCALE_LABEL[localeFilter] ?? localeFilter.toUpperCase()
            }
            onSelect={setLocaleFilter}
            options={[
              { value: "all", label: "All locales" },
              ...locales.map((l) => ({
                value: l,
                label: LOCALE_LABEL[l] ?? l.toUpperCase(),
              })),
            ]}
          />
        )}

        {anyFilterActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setKindFilter("all");
              setVoiceFilter("all");
              setLocaleFilter("all");
            }}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-[var(--color-muted-foreground)] tabular-nums">
          {filtered.length} of {items.length}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Download className="h-3 w-3" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href="/api/library/export?format=json" download>
                JSON (full metadata)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/api/library/export?format=csv" download>
                CSV (spreadsheet)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/api/library/export?format=md" download>
                Markdown (one big file)
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 px-3 py-2 text-sm"
        >
          <CheckSquare className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          <span className="font-medium tabular-nums">
            {selected.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={selectAllFiltered}
          >
            Select all visible ({filtered.length})
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={clearSelection}
          >
            Clear
          </Button>
          <span className="ml-auto" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => exportSelected(items, selected)}
          >
            <Download className="h-3 w-3" /> Export selection
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
            onClick={handleBulkDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3 w-3" />
            {isDeleting ? "Removing…" : "Remove from library"}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-12 text-center text-sm text-[var(--color-muted-foreground)]">
          Nothing matches the current filters.
        </p>
      ) : (
        <div className="mt-6 grid gap-4">
          {filtered.map((it) => (
            <LibraryCard
              key={it.id}
              item={it}
              selected={selected.has(it.id)}
              onToggleSelect={() => toggle(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function exportSelected(items: LibraryItem[], selected: Set<string>) {
  const picked = items.filter((it) => selected.has(it.id));
  const payload = picked.map((it) => {
    if (it.kind === "variant") {
      return {
        kind: "variant",
        runKind: it.runKind,
        label: it.label,
        locale: it.locale,
        voice: it.voice?.name ?? null,
        auditScore: it.auditScore,
        content: it.refinedContent ?? it.content,
        runId: it.runId,
        savedAt: it.savedAt,
      };
    }
    if (it.kind === "chat_message") {
      return {
        kind: "chat_message",
        title: it.title,
        locale: it.locale,
        voice: it.voice?.name ?? null,
        content: it.content,
        chatThreadId: it.chatThreadId,
        savedAt: it.savedAt,
      };
    }
    return {
      kind: "document_selection",
      title: it.title,
      documentTitle: it.documentTitle,
      locale: it.locale,
      voice: it.voice?.name ?? null,
      content: it.content,
      documentId: it.documentId,
      selectionAnchor: it.selectionAnchor,
      savedAt: it.savedAt,
    };
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `library-selection-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function labelForKind(k: KindFilter): string {
  switch (k) {
    case "all":
      return "All";
    case "copywriter":
      return "Copywriter";
    case "localizer":
      return "Localizer";
    case "chat_message":
      return "Chat saves";
    case "document_selection":
      return "Doc selections";
  }
}

interface CardProps {
  item: LibraryItem;
  selected: boolean;
  onToggleSelect: () => void;
}

function LibraryCard({ item, selected, onToggleSelect }: CardProps) {
  return (
    <article
      className={
        "rounded-xl border bg-[var(--color-card)] p-5 transition " +
        (selected
          ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40"
          : "border-[var(--color-border)]")
      }
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect" : "Select"}
          aria-pressed={selected}
          className="mt-0.5 flex h-5 w-5 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-[var(--color-primary)]" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          {item.kind === "variant" ? (
            <VariantBody item={item} />
          ) : item.kind === "chat_message" ? (
            <ChatBody item={item} />
          ) : (
            <DocumentBody item={item} />
          )}
        </div>
      </div>
    </article>
  );
}

function VariantBody({ item }: { item: LibraryVariantItem }) {
  const isLocalizer = item.runKind === "localizer";
  const brief = item.runBrief ?? undefined;
  const headline = isLocalizer
    ? `${
        brief && "sourceLocale" in brief
          ? (brief as LocalizerBrief).sourceLocale.toUpperCase()
          : ""
      } → ${LOCALE_LABEL[item.locale] ?? item.locale.toUpperCase()}`
    : item.label ?? "Variant";
  const display = item.refinedContent ?? item.content;
  return (
    <>
      <header className="flex items-center gap-3">
        {isLocalizer ? (
          <Languages className="h-4 w-4 text-[var(--color-primary)]" />
        ) : (
          <Bot className="h-4 w-4 text-[var(--color-primary)]" />
        )}
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {isLocalizer ? "Localizer" : "Copywriter"}
        </span>
        <h3 className="font-display text-base tracking-tight line-clamp-1">
          {headline}
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
          {item.voice && (
            <Badge variant="outline" className="text-[10px] tracking-wider">
              {item.voice.name}
            </Badge>
          )}
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {LOCALE_LABEL[item.locale] ?? item.locale.toUpperCase()}
          </Badge>
          {item.auditScore != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-success)]">
              <span className="font-mono">{item.auditScore}</span>
            </span>
          )}
        </div>
      </header>
      <p
        className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty line-clamp-4"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      >
        {display}
      </p>
      <footer className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span>Saved {formatDistanceShort(item.savedAt)}</span>
        <Link
          href={`/agents/runs/${item.runId}`}
          className="hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
        >
          View run
        </Link>
        <LibraryCopyButton content={display} />
      </footer>
    </>
  );
}

function ChatBody({ item }: { item: LibraryChatMessageItem }) {
  return (
    <>
      <header className="flex items-center gap-3">
        <MessageCircle className="h-4 w-4 text-[var(--color-primary)]" />
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Chat
        </span>
        <h3 className="font-display text-base tracking-tight line-clamp-1">
          {item.title ?? "Chat reply"}
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
          {item.voice && (
            <Badge variant="outline" className="text-[10px] tracking-wider">
              {item.voice.name}
            </Badge>
          )}
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {LOCALE_LABEL[item.locale] ?? item.locale.toUpperCase()}
          </Badge>
        </div>
      </header>
      <p
        className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty line-clamp-4"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      >
        {item.content}
      </p>
      <footer className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span>Saved {formatDistanceShort(item.savedAt)}</span>
        {item.chatThreadId && (
          <Link
            href={`/chat/${item.chatThreadId}`}
            className="hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
          >
            Open thread
          </Link>
        )}
        <LibraryCopyButton content={item.content} />
      </footer>
    </>
  );
}

function DocumentBody({ item }: { item: LibraryDocumentSelectionItem }) {
  return (
    <>
      <header className="flex items-center gap-3">
        <FileText className="h-4 w-4 text-[var(--color-primary)]" />
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Document selection
        </span>
        <h3 className="font-display text-base tracking-tight line-clamp-1">
          {item.title ?? item.documentTitle ?? "Selection"}
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
          {item.voice && (
            <Badge variant="outline" className="text-[10px] tracking-wider">
              {item.voice.name}
            </Badge>
          )}
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {LOCALE_LABEL[item.locale] ?? item.locale.toUpperCase()}
          </Badge>
        </div>
      </header>
      <p
        className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty line-clamp-4"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      >
        {item.content}
      </p>
      <footer className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span>Saved {formatDistanceShort(item.savedAt)}</span>
        {item.documentId && (
          <Link
            href={`/documents/${item.documentId}`}
            className="hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
          >
            Open document
          </Link>
        )}
        <LibraryCopyButton content={item.content} />
      </footer>
    </>
  );
}

interface ChipDropdownProps {
  label: string;
  value: string;
  onSelect: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}

function ChipDropdown({ label, value, onSelect, options }: ChipDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <span className="text-[var(--color-muted-foreground)]">{label}:</span>
          <span className="font-medium">{value}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onSelect(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Re-export icon used in empty-state by the page.
export { LibraryIcon };
