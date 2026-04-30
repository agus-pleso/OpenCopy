"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Check,
  X,
  BookOpen,
  Users,
  GraduationCap,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandVoice, Locale } from "@/db/schema";

interface VoiceCardDisplayProps {
  voice: BrandVoice;
  locale?: Locale;
  className?: string;
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

export function VoiceCardDisplay({ voice, locale, className }: VoiceCardDisplayProps) {
  const has = (xs: unknown[] | string | null | undefined) =>
    Array.isArray(xs) ? xs.length > 0 : !!xs;

  const isAnalyzed = !!voice.analyzedAt;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]",
        "shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      {/* Decorative top band */}
      <div className="h-1 bg-gradient-to-r from-[var(--color-primary)] via-[var(--color-primary)]/60 to-transparent" />

      <div className="px-7 py-7 md:px-9 md:py-8">
        {/* Header: Persona + Audience as the spine */}
        <div className="grid gap-6 md:grid-cols-2">
          {voice.voicePersona && (
            <Section label="Persona" icon={Quote}>
              <p className="text-pretty text-[15px] leading-relaxed text-[var(--color-foreground)]">
                {voice.voicePersona}
              </p>
            </Section>
          )}
          {voice.audience && (
            <Section label="Audience" icon={Users}>
              <p className="text-pretty text-[15px] leading-relaxed text-[var(--color-foreground)]">
                {voice.audience}
              </p>
            </Section>
          )}
        </div>

        {/* Metadata strip */}
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-border)]/60 py-3 text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {voice.readingLevel && (
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              <span className="normal-case tracking-normal text-[13px] text-[var(--color-foreground)]">
                {voice.readingLevel}
              </span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <span className="normal-case tracking-normal text-[13px] text-[var(--color-foreground)]">
              {LOCALE_LABELS[voice.defaultLocale]}
            </span>
          </span>
          {voice.analyzedAt && (
            <span className="ml-auto normal-case tracking-normal text-[12px] text-[var(--color-muted-foreground)]">
              Analyzed{" "}
              {new Date(voice.analyzedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        {/* Tone */}
        {has(voice.toneDescriptors) && (
          <div className="mt-7">
            <Label>Tone</Label>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {voice.toneDescriptors.map((t, i) => (
                <motion.span
                  key={t + i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-1 text-sm font-medium tracking-tight"
                >
                  {t}
                </motion.span>
              ))}
            </div>
          </div>
        )}

        {/* Do / Don't grid */}
        {(has(voice.dos) || has(voice.donts)) && (
          <div className="mt-7 grid gap-7 md:grid-cols-2">
            {has(voice.dos) && (
              <RuleColumn
                label="Do"
                icon={Check}
                tint="success"
                rules={voice.dos}
              />
            )}
            {has(voice.donts) && (
              <RuleColumn
                label="Don't"
                icon={X}
                tint="destructive"
                rules={voice.donts}
              />
            )}
          </div>
        )}

        {/* Vocabulary */}
        {(has(voice.requiredWords) || has(voice.forbiddenWords)) && (
          <div className="mt-7 grid gap-7 md:grid-cols-2">
            {has(voice.requiredWords) && (
              <div>
                <Label>Required vocabulary</Label>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {voice.requiredWords.map((w, i) => (
                    <span
                      key={w + i}
                      className="inline-flex items-center rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-mono text-[var(--color-success)]"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {has(voice.forbiddenWords) && (
              <div>
                <Label>Forbidden vocabulary</Label>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {voice.forbiddenWords.map((w, i) => (
                    <span
                      key={w + i}
                      className="inline-flex items-center rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-2 py-0.5 text-xs font-mono text-[var(--color-destructive)] line-through decoration-1"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Locale notes */}
        {locale && voice.localeNotes?.[locale] && (
          <div className="mt-7 rounded-md border-l-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-primary)]">
              Locale notes · {LOCALE_LABELS[locale]}
            </p>
            <p className="mt-1.5 text-sm text-pretty">{voice.localeNotes[locale]}</p>
          </div>
        )}

        {/* Rationale */}
        {voice.rationale && (
          <div className="mt-8 border-t border-[var(--color-border)]/60 pt-5">
            <Label>Rationale</Label>
            <p className="mt-2 max-w-2xl text-pretty text-sm italic leading-relaxed text-[var(--color-muted-foreground)]">
              {voice.rationale}
            </p>
          </div>
        )}

        {!isAnalyzed && (
          <div className="mt-6 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
            This voice hasn&apos;t been analyzed yet. Add samples and run the
            analyzer to populate the profile.
          </div>
        )}
      </div>
    </motion.article>
  );
}

function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
      {children}
    </p>
  );
}

function RuleColumn({
  label,
  icon: Icon,
  tint,
  rules,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: "success" | "destructive";
  rules: { rule: string; why?: string }[];
}) {
  const tintClasses =
    tint === "success"
      ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
      : "bg-[var(--color-destructive)]/12 text-[var(--color-destructive)]";
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-md", tintClasses)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <Label>{label}</Label>
      </div>
      <ol className="mt-3 flex flex-col gap-2.5">
        {rules.map((r, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: tint === "success" ? -4 : 4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
            className="flex gap-3 text-[14px] leading-snug text-pretty"
          >
            <span className="select-none pt-[2px] text-xs font-mono text-[var(--color-muted-foreground)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <span>{r.rule}</span>
              {r.why && (
                <span className="text-[var(--color-muted-foreground)]">
                  {" "}
                  — {r.why}
                </span>
              )}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
