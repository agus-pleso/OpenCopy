"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoMark } from "@/components/marketing/logo";

interface Phase {
  label: string;
  detail: string;
  /** Approx seconds at which this phase becomes active. */
  at: number;
}

const COPYWRITER_PHASES: Phase[] = [
  { at: 0, label: "Planning angles", detail: "Reading the brief and your brand voice." },
  { at: 6, label: "Drafting variants in parallel", detail: "Each angle gets its own drafter." },
  { at: 22, label: "Auditing voice fidelity", detail: "Scoring every variant line by line." },
  { at: 36, label: "Finalizing", detail: "Wrapping up — almost there." },
];

const LOCALIZER_PHASES: Phase[] = [
  { at: 0, label: "Adapting culture", detail: "Flagging idioms and references." },
  { at: 7, label: "Transcreating", detail: "Rendering for the target locale." },
  { at: 22, label: "Back-translating", detail: "Sanity-checking meaning." },
  { at: 30, label: "Auditing voice", detail: "Validating it stays on-brand." },
];

export function AgentRunningOverlay({ kind }: { kind: "copywriter" | "localizer" }) {
  const phases = kind === "copywriter" ? COPYWRITER_PHASES : LOCALIZER_PHASES;
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, []);

  const activeIdx = phases.reduce(
    (acc, p, i) => (elapsed >= p.at ? i : acc),
    0,
  );
  const active = phases[activeIdx];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-background)]/80 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative flex w-full max-w-md flex-col items-center px-8 py-10"
      >
        <motion.div
          animate={{
            scale: [1, 1.06, 1],
            rotate: [0, 6, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <LogoMark className="h-14 w-14" />
        </motion.div>
        <p className="mt-8 text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          OpenCopy is working
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={active.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-center"
          >
            <p className="font-display text-2xl tracking-tight">{active.label}</p>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {active.detail}
            </p>
          </motion.div>
        </AnimatePresence>

        <ol className="mt-8 flex w-full flex-col gap-2">
          {phases.map((p, i) => {
            const done = i < activeIdx;
            const current = i === activeIdx;
            return (
              <li
                key={p.label}
                className="flex items-center gap-3 text-sm"
              >
                <span
                  className={
                    done
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : current
                      ? "flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--color-primary)]"
                      : "flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)]"
                  }
                >
                  {done ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                      <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : current ? (
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                      className="block h-2 w-2 rounded-full bg-[var(--color-primary)]"
                    />
                  ) : null}
                </span>
                <span
                  className={
                    done
                      ? "text-[var(--color-foreground)]"
                      : current
                      ? "font-medium text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-foreground)]"
                  }
                >
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-xs tabular-nums text-[var(--color-muted-foreground)]">
          Elapsed: {elapsed}s
        </p>
      </motion.div>
    </div>
  );
}
