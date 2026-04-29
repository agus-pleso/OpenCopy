"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

export function UsageWindowToggle({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const onPick = (days: number) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("days", String(days));
    router.push(`/settings/usage?${sp.toString()}`);
  };

  return (
    <div className="inline-flex rounded-md border border-[--color-border] p-0.5">
      {WINDOWS.map((w) => (
        <button
          key={w.value}
          type="button"
          onClick={() => onPick(w.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium tracking-tight transition rounded",
            current === w.value
              ? "bg-[--color-primary] text-[--color-primary-foreground]"
              : "text-[--color-muted-foreground] hover:bg-[--color-accent]",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
