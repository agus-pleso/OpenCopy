"use client";

import * as React from "react";
import { Copy, Languages, Globe, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CopyVariant, Locale } from "@/db/schema";

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

interface Props {
  variant: CopyVariant;
  sourceText: string;
  sourceLocale: Locale;
}

export function LocalizerResult({ variant, sourceText, sourceLocale }: Props) {
  const culturalNotes = (variant.culturalNotes ?? []) as Array<{
    excerpt: string;
    note: string;
  }>;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied.`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
    >
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-3">
        <Languages className="h-4 w-4 text-[var(--color-primary)]" />
        <Badge variant="outline" className="text-[10px] tracking-wider">
          {LOCALE_LABEL[sourceLocale]}
        </Badge>
        <ArrowLeftRight className="h-3 w-3 text-[var(--color-muted-foreground)]" />
        <Badge variant="default" className="text-[10px] tracking-wider">
          {LOCALE_LABEL[variant.locale]}
        </Badge>
        {variant.auditScore != null && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--color-success)]">
            <span className="font-mono">{variant.auditScore}</span>
            <span className="opacity-70">·</span>
            <span>voice score</span>
          </span>
        )}
      </div>

      <div className="grid divide-y divide-[var(--color-border)] md:grid-cols-2 md:divide-x md:divide-y-0">
        <section className="px-5 py-5">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              Source · {LOCALE_LABEL[sourceLocale]}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
              onClick={() => copy(sourceText, "Source")}
              aria-label="Copy source"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p
            className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty"
            style={{ fontFamily: "ui-serif, Georgia, serif" }}
          >
            {sourceText}
          </p>
        </section>
        <section className="px-5 py-5">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-primary)]">
              Target · {LOCALE_LABEL[variant.locale]}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
              onClick={() => copy(variant.content, "Target")}
              aria-label="Copy target"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p
            className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty"
            style={{ fontFamily: "ui-serif, Georgia, serif" }}
          >
            {variant.content}
          </p>
        </section>
      </div>

      {(variant.backTranslation || culturalNotes.length > 0) && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-muted)]/30 px-5 py-4">
          <Tabs
            defaultValue={culturalNotes.length > 0 ? "cultural" : "back"}
          >
            <TabsList>
              <TabsTrigger value="cultural">
                <Globe className="h-3.5 w-3.5" /> Cultural notes ({culturalNotes.length})
              </TabsTrigger>
              {variant.backTranslation && (
                <TabsTrigger value="back">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Back-translation
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="cultural" className="mt-4">
              {culturalNotes.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Source translated cleanly — no cultural landmines flagged.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {culturalNotes.map((n, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3"
                    >
                      <blockquote className="border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)]/50 px-3 py-1 text-sm italic">
                        &ldquo;{n.excerpt}&rdquo;
                      </blockquote>
                      <p className="mt-1.5 text-sm text-pretty">{n.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            {variant.backTranslation && (
              <TabsContent value="back" className="mt-4">
                <p
                  className="whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-[14px] leading-relaxed text-pretty"
                  style={{ fontFamily: "ui-serif, Georgia, serif" }}
                >
                  {variant.backTranslation}
                </p>
                <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                  Literal-leaning back-translation into {LOCALE_LABEL[sourceLocale]}.
                  Use this to sanity-check what the transcreation actually says.
                </p>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </motion.div>
  );
}
