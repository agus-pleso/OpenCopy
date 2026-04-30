"use client";

import * as React from "react";
import { useTransition } from "react";
import { Plus, Trash2, FileText, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { replaceSamples } from "@/server/actions/voices";
import type { Locale, VoiceSample } from "@/db/schema";

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

interface DraftSample {
  id: string; // local-only
  content: string;
  locale: Locale;
  sourceLabel?: string;
}

interface Props {
  voiceId: string;
  initial: VoiceSample[];
  onSaved?: () => void;
}

function mkId() {
  return Math.random().toString(36).slice(2);
}

function wc(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function SamplesEditor({ voiceId, initial, onSaved }: Props) {
  const [pending, startTransition] = useTransition();
  const [samples, setSamples] = React.useState<DraftSample[]>(() =>
    initial.length > 0
      ? initial.map((s) => ({
          id: s.id,
          content: s.content,
          locale: s.locale,
          sourceLabel: s.sourceLabel ?? undefined,
        }))
      : [{ id: mkId(), content: "", locale: "en" }],
  );
  const [dirty, setDirty] = React.useState(false);

  const totalWords = samples.reduce((acc, s) => acc + wc(s.content), 0);
  const usable = samples.filter((s) => s.content.trim().length >= 40);

  const addSample = () => {
    setSamples((prev) => [
      ...prev,
      { id: mkId(), content: "", locale: prev.at(-1)?.locale ?? "en" },
    ]);
    setDirty(true);
  };

  const removeSample = (id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  };

  const update = (id: string, patch: Partial<DraftSample>) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    setDirty(true);
  };

  const onSave = () => {
    startTransition(async () => {
      try {
        await replaceSamples({
          voiceId,
          samples: usable.map((s) => ({
            content: s.content,
            locale: s.locale,
            sourceLabel: s.sourceLabel || undefined,
          })),
        });
        toast.success(`Saved ${usable.length} sample${usable.length === 1 ? "" : "s"}.`);
        setDirty(false);
        onSaved?.();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <FileText className="h-4 w-4" />
          <span>
            {usable.length} usable{" "}
            <span className="text-[var(--color-foreground)]">·</span>{" "}
            {totalWords.toLocaleString()} words total
          </span>
          {dirty && (
            <Badge variant="warning" className="ml-2 text-[10px]">
              Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addSample}>
            <Plus className="h-3.5 w-3.5" /> Add sample
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={pending || !dirty || usable.length === 0}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {samples.map((s, i) => {
          const sampleWords = wc(s.content);
          const tooShort = s.content.length > 0 && s.content.length < 40;
          return (
            <div
              key={s.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]"
            >
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
                <span className="text-xs font-mono text-[var(--color-muted-foreground)]">
                  Sample {String(i + 1).padStart(2, "0")}
                </span>
                <Input
                  className="h-7 max-w-[280px] border-none bg-transparent px-2 text-sm shadow-none focus-visible:bg-[var(--color-muted)]"
                  placeholder="Source label (optional, e.g. 'Homepage Q3')"
                  value={s.sourceLabel ?? ""}
                  onChange={(e) =>
                    update(s.id, { sourceLabel: e.target.value })
                  }
                />
                <div className="ml-auto flex items-center gap-2">
                  <Select
                    value={s.locale}
                    onValueChange={(v) => update(s.id, { locale: v as Locale })}
                  >
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                    {sampleWords} w
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                    onClick={() => removeSample(s.id)}
                    aria-label="Remove sample"
                    disabled={samples.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={s.content}
                onChange={(e) => update(s.id, { content: e.target.value })}
                placeholder="Paste a representative writing sample (homepage copy, blog intro, ad, email…). 40 words minimum."
                className="min-h-[140px] resize-y rounded-none border-none focus-visible:ring-0 font-serif"
                style={{ fontFamily: "ui-serif, Georgia, serif" }}
              />
              {tooShort && (
                <div className="border-t border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-1.5 text-xs text-[var(--color-warning)]">
                  Too short — at least 40 characters needed.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)] text-pretty">
        Tip: 3–5 representative samples produce the most accurate voice profile.
        Mix channels (homepage, ad copy, email) for a fuller picture.
      </p>
    </div>
  );
}
