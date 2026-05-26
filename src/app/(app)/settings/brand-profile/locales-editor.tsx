"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import type { Locale } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { updateBrandLocales } from "@/server/actions/brand-profile";
import { cn } from "@/lib/utils";

const ALL_LOCALES: Locale[] = ["en", "pl", "ro", "uk"];
const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

interface Props {
  initial: Locale[];
}

export function LocalesEditor({ initial }: Props) {
  const router = useRouter();
  const [locales, setLocales] = React.useState<Locale[]>(initial);
  const [pending, startTransition] = React.useTransition();

  const toggle = (l: Locale) => {
    setLocales((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  const onSave = () => {
    if (locales.length === 0) {
      toast.error("Pick at least one locale.");
      return;
    }
    startTransition(async () => {
      try {
        await updateBrandLocales(locales);
        toast.success("Locales updated.");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message || "Couldn't save.");
      }
    });
  };

  const dirty = !arraysEqual(locales, initial);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {ALL_LOCALES.map((l) => {
          const active = locales.includes(l);
          return (
            <button
              key={l}
              type="button"
              onClick={() => toggle(l)}
              disabled={pending}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]",
              )}
            >
              {LOCALE_LABEL[l]}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={!dirty || pending} className="gap-1.5">
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

function arraysEqual(a: Locale[], b: Locale[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}
