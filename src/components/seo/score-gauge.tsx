"use client";

/**
 * ScoreGauge — animated 0-100 arc.
 *
 * Built directly on framer-motion (already in deps) so the arc fill + the
 * tabular number both ease in from zero on mount. The arc colour key'd off
 * the tier — green when shipping-clean, warning when needs-light-edits,
 * destructive when needs-rewrite — keeps the marketer's signal/decision
 * loop tight without needing to read the number.
 *
 * Variants:
 *   - "lg" → the big composite gauge, ~180px wide.
 *   - "sm" → the per-criterion card gauge, ~64px.
 */

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

import { cn } from "@/lib/utils";

interface Props {
  /** 0-100 target score. Values outside the range are clamped. */
  score: number;
  /** Visual size: lg = big composite, sm = per-criterion card. */
  size?: "lg" | "sm";
  /** Stagger entry by N ms. Used by the criterion grid (each card 100ms after the previous). */
  delay?: number;
  /** Override tint by tier. Use this when you want a flat accent (e.g., the
   *  primary terracotta) instead of the green/warning/destructive ladder. */
  variant?: "tiered" | "primary";
  className?: string;
}

const SIZE_SPEC = {
  lg: {
    box: 180,
    radius: 78,
    stroke: 9,
    fontClass: "text-5xl",
    suffixClass: "text-base",
  },
  sm: {
    box: 64,
    radius: 27,
    stroke: 4,
    fontClass: "text-lg",
    suffixClass: "text-[10px]",
  },
} as const;

export function ScoreGauge({
  score,
  size = "lg",
  delay = 0,
  variant = "tiered",
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const spec = SIZE_SPEC[size];
  const circumference = 2 * Math.PI * spec.radius;

  const tint = React.useMemo(() => {
    if (variant === "primary") return "var(--color-primary)";
    if (clamped >= 80) return "var(--color-success)";
    if (clamped >= 60) return "var(--color-primary)";
    if (clamped >= 40) return "var(--color-warning)";
    return "var(--color-destructive)";
  }, [clamped, variant]);

  // Animate the displayed number from 0 → clamped.
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (v) => Math.round(v).toString());

  React.useEffect(() => {
    motionValue.set(0);
    const controls = animate(motionValue, clamped, {
      duration: size === "lg" ? 1.2 : 0.8,
      delay: delay / 1000,
      ease: "easeOut",
    });
    return controls.stop;
  }, [clamped, delay, motionValue, size]);

  // Arc dasharray animation. We tween dashoffset from "full" → "scaled by score".
  const filledLen = (circumference * clamped) / 100;

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: spec.box, height: spec.box }}
    >
      <svg
        width={spec.box}
        height={spec.box}
        viewBox={`0 0 ${spec.box} ${spec.box}`}
        className="-rotate-90"
      >
        {/* Track */}
        <circle
          cx={spec.box / 2}
          cy={spec.box / 2}
          r={spec.radius}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={spec.stroke}
        />
        {/* Fill */}
        <motion.circle
          cx={spec.box / 2}
          cy={spec.box / 2}
          r={spec.radius}
          fill="none"
          stroke={tint}
          strokeWidth={spec.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filledLen }}
          transition={{
            duration: size === "lg" ? 1.2 : 0.8,
            delay: delay / 1000,
            ease: [0.2, 0.65, 0.3, 0.9],
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-display tabular-nums leading-none">
        <motion.span className={cn(spec.fontClass, "tracking-tight")}>
          {display}
        </motion.span>
        {size === "lg" && (
          <span
            className={cn(
              "mt-1.5 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]",
              spec.suffixClass,
            )}
          >
            / 100
          </span>
        )}
      </div>
    </div>
  );
}
