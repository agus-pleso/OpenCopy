"use client";

/**
 * ComposeContextBar — the single voice/locale/knowledge picker shared across
 * Copywriter, Localizer, Campaign, Chat thread header, Document toolbar.
 *
 * Fully controlled. Caller owns state and persistence. Two visual variants:
 *   - "form"   — boxed card with section header. Used in form pages.
 *   - "inline" — horizontal strip, no border, no header. Used in headers.
 *
 * Filtering:
 *   - Voices: only voices with `isAnalyzed=true` are shown.
 *   - Sources: only sources with `status="ready"` are shown.
 *   This is intentional — surfaces shouldn't have to remember to filter.
 */

import * as React from "react";
import Link from "next/link";
import { BookOpen, Languages, ScanText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Locale } from "@/db/schema";

export interface ComposeVoiceOption {
  id: string;
  name: string;
  isAnalyzed: boolean;
}

export interface ComposeSourceOption {
  id: string;
  name: string;
  /** Optional — shown as a subscript on the chip when present. */
  chunkCount?: number;
  status: string;
}

export interface ComposeContextValue {
  voiceId: string | null;
  locale: Locale;
  sourceIds: string[];
}

export interface ComposeContextBarProps {
  value: ComposeContextValue;
  onChange: (next: ComposeContextValue) => void;

  voices: ComposeVoiceOption[];
  sources?: ComposeSourceOption[];

  /** "form" = boxed card; "inline" = header strip. */
  variant?: "form" | "inline";

  /** When true, voice can't be cleared — "No voice" option is hidden. */
  voiceRequired?: boolean;

  /** When true, hides the locale picker entirely. */
  hideLocale?: boolean;

  /** When true, hides the knowledge-source chips entirely. */
  hideSources?: boolean;

  /** When true, all controls render disabled. */
  readOnly?: boolean;

  /**
   * Optional ID prefix for `data-tour` anchors so per-surface tours can
   * spotlight individual controls (e.g. "copywriter-voice").
   */
  tourPrefix?: string;
}

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

const VOICE_NONE = "__none";

export function ComposeContextBar({
  value,
  onChange,
  voices,
  sources = [],
  variant = "form",
  voiceRequired = false,
  hideLocale = false,
  hideSources = false,
  readOnly = false,
  tourPrefix,
}: ComposeContextBarProps) {
  const usableVoices = voices.filter((v) => v.isAnalyzed);
  const usableSources = sources.filter((s) => s.status === "ready");

  const update = (patch: Partial<ComposeContextValue>) => {
    onChange({ ...value, ...patch });
  };

  const onVoiceChange = (next: string) => {
    update({ voiceId: next === VOICE_NONE ? null : next });
  };

  const onLocaleChange = (next: string) => {
    update({ locale: next as Locale });
  };

  const toggleSource = (id: string) => {
    const has = value.sourceIds.includes(id);
    update({
      sourceIds: has
        ? value.sourceIds.filter((x) => x !== id)
        : [...value.sourceIds, id],
    });
  };

  const voiceSelectValue = value.voiceId ?? VOICE_NONE;

  // ----- INLINE VARIANT (chat/document headers) -----
  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div
          className="inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)]"
          data-tour={tourPrefix ? `${tourPrefix}-voice` : undefined}
        >
          <ScanText className="h-3.5 w-3.5" />
          <Select
            value={voiceSelectValue}
            onValueChange={onVoiceChange}
            disabled={readOnly}
          >
            <SelectTrigger className="h-7 w-[180px] border-none bg-transparent px-1 text-xs shadow-none">
              <SelectValue placeholder={voiceRequired ? "Pick a voice" : "No voice"} />
            </SelectTrigger>
            <SelectContent>
              {!voiceRequired && (
                <SelectItem value={VOICE_NONE}>No voice</SelectItem>
              )}
              {usableVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!hideLocale && (
          <div
            className="inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)]"
            data-tour={tourPrefix ? `${tourPrefix}-locale` : undefined}
          >
            <Languages className="h-3.5 w-3.5" />
            <Select
              value={value.locale}
              onValueChange={onLocaleChange}
              disabled={readOnly}
            >
              <SelectTrigger className="h-7 w-[120px] border-none bg-transparent px-1 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!hideSources && usableSources.length > 0 && (
          <SourceChips
            sources={usableSources}
            selectedIds={value.sourceIds}
            onToggle={toggleSource}
            readOnly={readOnly}
            inline
            tourPrefix={tourPrefix}
          />
        )}

        {value.sourceIds.length > 0 && !hideSources && (
          <Badge variant="muted" className="text-[10px] tracking-wider">
            {value.sourceIds.length} active
          </Badge>
        )}
      </div>
    );
  }

  // ----- FORM VARIANT (Copywriter/Localizer/Campaign) -----
  return (
    <div
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      data-tour={tourPrefix ? `${tourPrefix}-context` : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanText className="h-4 w-4 text-[var(--color-primary)]" />
          <Label className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Compose context
          </Label>
        </div>
        <Link
          href="/voices"
          className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
        >
          Manage voices
        </Link>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Brand voice
            {voiceRequired && (
              <span className="ml-1 text-[var(--color-primary)]">*</span>
            )}
          </Label>
          <Select
            value={voiceSelectValue}
            onValueChange={onVoiceChange}
            disabled={readOnly}
          >
            <SelectTrigger
              data-tour={tourPrefix ? `${tourPrefix}-voice` : undefined}
            >
              <SelectValue placeholder={voiceRequired ? "Pick a voice" : "No voice"} />
            </SelectTrigger>
            <SelectContent>
              {!voiceRequired && (
                <SelectItem value={VOICE_NONE}>No voice</SelectItem>
              )}
              {usableVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!hideLocale && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              Locale
            </Label>
            <Select
              value={value.locale}
              onValueChange={onLocaleChange}
              disabled={readOnly}
            >
              <SelectTrigger
                data-tour={tourPrefix ? `${tourPrefix}-locale` : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!hideSources && usableSources.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border)]/60 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[var(--color-primary)]" />
              <Label className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Knowledge sources
              </Label>
              {value.sourceIds.length > 0 && (
                <Badge variant="muted" className="text-[10px] tracking-wider">
                  {value.sourceIds.length} selected
                </Badge>
              )}
            </div>
            <Link
              href="/knowledge"
              className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
            >
              Manage
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
            Pick which sources the planner + drafters consult. We retrieve the
            top 8 most relevant chunks per run.
          </p>
          <div className="mt-3">
            <SourceChips
              sources={usableSources}
              selectedIds={value.sourceIds}
              onToggle={toggleSource}
              readOnly={readOnly}
              tourPrefix={tourPrefix}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface SourceChipsProps {
  sources: ComposeSourceOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  readOnly?: boolean;
  inline?: boolean;
  tourPrefix?: string;
}

function SourceChips({
  sources,
  selectedIds,
  onToggle,
  readOnly,
  inline,
  tourPrefix,
}: SourceChipsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-tour={tourPrefix ? `${tourPrefix}-sources` : undefined}
    >
      {inline && (
        <BookOpen className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
      )}
      {sources.map((s) => {
        const selected = selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            disabled={readOnly}
            aria-pressed={selected}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
              inline
                ? "px-2.5 py-0.5 text-[11px]"
                : "px-3 py-1 text-xs",
              selected
                ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
            )}
          >
            <span>{s.name}</span>
            {s.chunkCount != null && !inline && (
              <span className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                {s.chunkCount}c
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
