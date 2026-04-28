"use client";

import * as React from "react";
import { Check, CloudUpload, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  state: SaveState;
  lastSavedAt: Date | null;
  className?: string;
}

export function AutosaveIndicator({ state, lastSavedAt, className }: Props) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <AnimatePresence mode="wait">
        {state === "saving" && (
          <motion.span
            key="saving"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-[--color-muted-foreground]"
          >
            <CloudUpload className="h-3 w-3" />
            Saving…
          </motion.span>
        )}
        {state === "saved" && (
          <motion.span
            key="saved"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-[--color-success]"
          >
            <Check className="h-3 w-3" />
            Saved {lastSavedAt && relativeTime(lastSavedAt)}
          </motion.span>
        )}
        {state === "error" && (
          <motion.span
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-[--color-destructive]"
          >
            <AlertCircle className="h-3 w-3" />
            Save failed
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function relativeTime(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}
