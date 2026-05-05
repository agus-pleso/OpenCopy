"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  Download,
  Filter,
  Languages,
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
import type {
  CopywriterBrief,
  LocalizerBrief,
} from "@/db/schema";

const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  pl: "PL",
  ro: "RO",
  uk: "UA",
};

type Kind = "copywriter" | "localizer";

interface VariantRow {
  id: string;
  content: string;
  refinedContent: string | null;
  locale: string;
  label: string | null;
  auditScore: number | null;
  runId: string;
  createdAt: Date | string;
  savedAt: Date | string | null;
  voice?: { id: string; name: string } | null;
  run?: {
    id: string;
    kind: Kind;
    brief: CopywriterBrief | LocalizerBrief | null;
  } | null;
}

interface Props {
  variants: VariantRow[];
}

type KindFilter = Kind | "all";

export function LibraryBoard({ variants }: Props) {
  const [kindFilter, setKindFilter] = React.useState<KindFilter>("all");
  const [voiceFilter, setVoiceFilter] = React.useState<string | "all">("all");
  const [localeFilter, setLocaleFilter] = React.useState<string | "all">("all");

  const voices = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const v of variants) {
      if (v.voice) map.set(v.voice.id, v.voice.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [variants]);

  const locales = React.useMemo(() => {
    const set = new Set<string>();
    for (const v of variants) set.add(v.locale);
    return Array.from(set).sort();
  }, [variants]);

  const filtered = variants.filter((v) => {
    if (kindFilter !== "all" && v.run?.kind !== kindFilter) return false;
    if (voiceFilter !== "all" && v.voice?.id !== voiceFilter) return false;
    if (localeFilter !== "all" && v.locale !== localeFilter) return false;
    return true;
  });

  const anyFilterActive =
    kindFilter !== "all" || voiceFilter !== "all" || localeFilter !== "all";

  return (
    <div className="mt-10" data-tour="library-list">
      <div
        className="flex flex-wrap items-center gap-2"
        data-tour="library-filters"
      >
        <Filter className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />

        <ChipDropdown
          label="Kind"
          value={kindFilter === "all" ? "All" : labelForKind(kindFilter)}
          onSelect={(v) => setKindFilter(v as KindFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "copywriter", label: "Copywriter" },
            { value: "localizer", label: "Localizer" },
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
          {filtered.length} of {variants.length}
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

      {filtered.length === 0 ? (
        <p className="mt-12 text-center text-sm text-[var(--color-muted-foreground)]">
          Nothing matches the current filters.
        </p>
      ) : (
        <div className="mt-6 grid gap-4">
          {filtered.map((v) => {
            const isLocalizer = v.run?.kind === "localizer";
            const brief = v.run?.brief ?? undefined;
            const headline = isLocalizer
              ? `${
                  brief && "sourceLocale" in brief
                    ? (brief as LocalizerBrief).sourceLocale.toUpperCase()
                    : ""
                } → ${LOCALE_LABEL[v.locale] ?? v.locale.toUpperCase()}`
              : v.label ?? "Variant";
            return (
              <article
                key={v.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
              >
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
                    {v.voice && (
                      <Badge
                        variant="outline"
                        className="text-[10px] tracking-wider"
                      >
                        {v.voice.name}
                      </Badge>
                    )}
                    <Badge variant="muted" className="text-[10px] tracking-wider">
                      {LOCALE_LABEL[v.locale] ?? v.locale.toUpperCase()}
                    </Badge>
                    {v.auditScore != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-success)]">
                        <span className="font-mono">{v.auditScore}</span>
                      </span>
                    )}
                  </div>
                </header>
                <p
                  className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty line-clamp-4"
                  style={{ fontFamily: "ui-serif, Georgia, serif" }}
                >
                  {v.refinedContent ?? v.content}
                </p>
                <footer className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                  <span>
                    Saved {formatDistanceShort(v.savedAt ?? v.createdAt)}
                  </span>
                  <Link
                    href={`/agents/runs/${v.runId}`}
                    className="hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
                  >
                    View run
                  </Link>
                  <LibraryCopyButton content={v.refinedContent ?? v.content} />
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function labelForKind(k: Kind): string {
  return k === "copywriter" ? "Copywriter" : "Localizer";
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
