"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Languages, Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";

import type { Locale } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startDeepDive } from "@/server/actions/brand-profile";

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

interface Props {
  availableLocales: Locale[];
}

export function DeepDiveButtons({ availableLocales }: Props) {
  const router = useRouter();
  const [localizerLocale, setLocalizerLocale] = React.useState<Locale>(
    availableLocales[0] ?? "en",
  );
  const [seoPending, startSeo] = React.useTransition();
  const [localizerPending, startLocalizer] = React.useTransition();

  const onSeo = () => {
    startSeo(async () => {
      try {
        const { chatId } = await startDeepDive({ kind: "seo_deep_dive" });
        router.push(`/brand-profile/deep-dive/${chatId}`);
      } catch (err) {
        toast.error((err as Error).message || "Couldn't start.");
      }
    });
  };

  const onLocalizer = () => {
    startLocalizer(async () => {
      try {
        const { chatId } = await startDeepDive({
          kind: "localizer_deep_dive",
          locale: localizerLocale,
        });
        router.push(`/brand-profile/deep-dive/${chatId}`);
      } catch (err) {
        toast.error((err as Error).message || "Couldn't start.");
      }
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <ScanText className="h-3.5 w-3.5" />
          </span>
          <p className="font-display tracking-tight">SEO deep-dive</p>
        </div>
        <p className="mt-2 text-sm text-pretty text-[var(--color-muted-foreground)]">
          Captures keyword priorities and competitor articles you&apos;d like to outrank.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={onSeo} disabled={seoPending} className="gap-1.5" size="sm">
            {seoPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Start
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Languages className="h-3.5 w-3.5" />
          </span>
          <p className="font-display tracking-tight">Localizer deep-dive</p>
        </div>
        <p className="mt-2 text-sm text-pretty text-[var(--color-muted-foreground)]">
          Capture idioms, formality preferences, and untranslatable terms for one locale.
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Select
            value={localizerLocale}
            onValueChange={(v) => setLocalizerLocale(v as Locale)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLocales.map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={onLocalizer}
            disabled={localizerPending}
            className="gap-1.5"
            size="sm"
          >
            {localizerPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}
