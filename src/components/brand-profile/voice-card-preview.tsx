"use client";

/**
 * voice-card-preview — small per-locale voice card used on the brand profile
 * page and inside the extractor preview. Mirrors the BrandProfileVoiceVariant
 * shape (formality dial, tone descriptors, sample pieces).
 *
 * Kept presentation-only so it can be reused with read-only data from the
 * profile or proposed data from the crawler preview.
 */

import { motion } from "framer-motion";
import { Sparkles, MessageSquareQuote } from "lucide-react";

import type { BrandProfileVoiceVariant, Locale } from "@/db/schema";
import { cn } from "@/lib/utils";

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

interface Props {
  locale: Locale;
  variant: BrandProfileVoiceVariant;
  /** When true, render the "no data yet" empty state. */
  empty?: boolean;
  className?: string;
}

export function VoiceCardPreview({ locale, variant, empty, className }: Props) {
  if (empty) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 px-5 py-8 text-center",
          className,
        )}
      >
        <Sparkles className="mx-auto h-5 w-5 text-[var(--color-muted-foreground)]" />
        <p className="mt-3 text-sm font-medium tracking-tight">
          No {LOCALE_LABEL[locale]} voice yet
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Start onboarding or paste samples to capture this voice.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
            {LOCALE_LABEL[locale]}
          </p>
          {variant.fromSampleAnalysis && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
              <Sparkles className="h-3 w-3" /> From samples
            </span>
          )}
        </div>
      </header>

      {/* Formality dial — animated fill, scored 1-10 */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-[var(--color-muted-foreground)]">
          <span>Casual</span>
          <span className="font-mono tabular-nums text-[var(--color-foreground)]">
            {variant.formality}/10
          </span>
          <span>Formal</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(variant.formality / 10) * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full bg-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Persona */}
      {variant.voicePersona && (
        <p className="mt-4 text-[14px] leading-relaxed text-pretty">
          {variant.voicePersona}
        </p>
      )}

      {/* Tone descriptors */}
      {variant.toneDescriptors.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {variant.toneDescriptors.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full bg-[var(--color-muted)] px-2.5 py-0.5 text-xs"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {variant.emotionalRegister && (
        <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
          Register: <span className="text-[var(--color-foreground)]">{variant.emotionalRegister}</span>
        </p>
      )}

      {/* Reading level + audience */}
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        {variant.readingLevel && (
          <div>
            <p className="uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Reading level</p>
            <p className="mt-0.5 text-[var(--color-foreground)]">{variant.readingLevel}</p>
          </div>
        )}
        {variant.audience && (
          <div>
            <p className="uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Audience</p>
            <p className="mt-0.5 text-[var(--color-foreground)]">{variant.audience}</p>
          </div>
        )}
      </div>

      {/* Sample pieces */}
      {variant.samplePieces.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
            Sample pieces
          </p>
          {variant.samplePieces.slice(0, 2).map((s, i) => (
            <blockquote
              key={i}
              className="rounded-md border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)]/30 px-3 py-2 text-sm italic leading-relaxed"
            >
              <MessageSquareQuote className="float-left mr-1 inline h-3.5 w-3.5 -translate-y-0.5 opacity-50" />
              {s.length > 240 ? s.slice(0, 240) + "…" : s}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}
