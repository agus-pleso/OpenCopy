"use client";

import * as React from "react";
import { Sparkles, Quote, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";

interface Props {
  strategy: string;
  hook: string;
}

/**
 * Collapsible strategy + hook block. Shown collapsed by default once the
 * campaign has assets so the assets list is the focus, but always available
 * with a one-click expand.
 */
export function CampaignStrategyPanel({ strategy, hook }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[var(--color-muted)]/30"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Campaign strategy
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-[14px] text-[var(--color-foreground)]",
              open && "text-[var(--color-muted-foreground)]",
            )}
          >
            {hook}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="px-5 py-4">
              <p className="text-pretty text-[15px] leading-relaxed">
                {strategy}
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-md border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)]/40 px-3 py-2">
                <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                <p className="text-pretty text-[15px] italic leading-snug">
                  {hook}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
