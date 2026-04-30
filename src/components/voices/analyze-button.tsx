"use client";

import * as React from "react";
import { useTransition } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { analyzeVoice } from "@/server/actions/voices";

interface Props {
  voiceId: string;
  hasSamples: boolean;
  alreadyAnalyzed: boolean;
}

const PHASES = [
  "Reading samples…",
  "Identifying tone patterns…",
  "Extracting do's & don'ts…",
  "Mapping vocabulary…",
  "Composing voice profile…",
];

export function AnalyzeButton({ voiceId, hasSamples, alreadyAnalyzed }: Props) {
  const [pending, startTransition] = useTransition();
  const [phaseIdx, setPhaseIdx] = React.useState(0);

  React.useEffect(() => {
    if (!pending) {
      setPhaseIdx(0);
      return;
    }
    const t = setInterval(() => {
      setPhaseIdx((i) => Math.min(i + 1, PHASES.length - 1));
    }, 1800);
    return () => clearInterval(t);
  }, [pending]);

  const onClick = () => {
    if (!hasSamples) {
      toast.error("Add at least one writing sample first.");
      return;
    }
    startTransition(async () => {
      const res = await analyzeVoice({ voiceId });
      if (res.ok) {
        toast.success(
          `Voice profile extracted${
            res.durationMs ? ` in ${(res.durationMs / 1000).toFixed(1)}s` : ""
          }.`,
        );
      } else {
        toast.error(res.message ?? "Analyzer failed.");
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        size="default"
        onClick={onClick}
        disabled={pending || !hasSamples}
        variant={alreadyAnalyzed ? "outline" : "default"}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : alreadyAnalyzed ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {alreadyAnalyzed ? "Re-analyze" : "Analyze samples"}
      </Button>
      <AnimatePresence mode="wait">
        {pending && (
          <motion.span
            key={phaseIdx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-sm text-[var(--color-muted-foreground)]"
          >
            {PHASES[phaseIdx]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
