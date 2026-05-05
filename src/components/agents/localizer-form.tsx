"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ComposeContextBar,
  type ComposeContextValue,
} from "@/components/compose/compose-context-bar";
import { cn } from "@/lib/utils";
import { startLocalizerRun } from "@/server/actions/agents";
import { AgentRunningOverlay } from "./agent-running-overlay";
import type { Locale } from "@/db/schema";

interface VoiceOption {
  id: string;
  name: string;
  isAnalyzed: boolean;
}

interface Props {
  voices: VoiceOption[];
}

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

export function LocalizerForm({ voices }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Localizer's "context" is just the voice — locale here is the SOURCE
  // locale, which is a localizer-specific concept (paired with targetLocales).
  // We hide the bar's locale picker and keep locale state local.
  const [compose, setCompose] = React.useState<ComposeContextValue>({
    voiceId: null,
    locale: "en",
    sourceIds: [],
  });
  const [sourceLocale, setSourceLocale] = React.useState<Locale>("en");
  const [targetLocales, setTargetLocales] = React.useState<Locale[]>(["pl"]);
  const [sourceText, setSourceText] = React.useState("");
  const [contextHint, setContextHint] = React.useState("");

  const toggleTarget = (l: Locale) => {
    setTargetLocales((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targets = targetLocales.filter((l) => l !== sourceLocale);
    if (targets.length === 0) {
      toast.error("Pick at least one target locale that differs from the source.");
      return;
    }
    if (sourceText.trim().length < 20) {
      toast.error("Paste at least 20 characters of source copy.");
      return;
    }
    startTransition(async () => {
      try {
        const { runId } = await startLocalizerRun({
          voiceId: compose.voiceId ?? undefined,
          sourceLocale,
          targetLocales: targets,
          sourceText: sourceText.trim(),
          contextHint: contextHint.trim() || undefined,
        });
        router.push(`/agents/runs/${runId}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-6">
        <ComposeContextBar
          value={compose}
          onChange={setCompose}
          voices={voices}
          hideLocale
          hideSources
          tourPrefix="localizer"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Field
              label="Source copy"
              hint="Paste the copy you want to adapt. The cultural adapter will identify what needs transcreation, not just translation."
            >
              <Textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste a headline, paragraph, ad, email, or full landing-page copy."
                className="min-h-[200px]"
                style={{ fontFamily: "ui-serif, Georgia, serif" }}
                required
                minLength={20}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <Field label="Source locale">
              <Select
                value={sourceLocale}
                onValueChange={(v) => setSourceLocale(v as Locale)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="flex items-center justify-center text-[var(--color-muted-foreground)]">
              <ArrowRight className="h-4 w-4" />
            </div>

            <Field
              label="Target locales"
              hint="Pick one or more — each runs in parallel and produces its own variant."
            >
              <div className="flex flex-wrap gap-1.5">
                {LOCALES.filter((l) => l.value !== sourceLocale).map((l) => {
                  const active = targetLocales.includes(l.value);
                  return (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => toggleTarget(l.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                        active
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                          : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/40",
                      )}
                      aria-pressed={active}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>

        <Field
          label="Context hint"
          hint="Optional. Channel, audience, or anything that shapes register."
        >
          <Textarea
            value={contextHint}
            onChange={(e) => setContextHint(e.target.value)}
            placeholder="e.g. B2B landing page, addressing senior PMs"
            className="min-h-[60px]"
            maxLength={500}
          />
        </Field>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={pending}>
            <Languages className="h-3.5 w-3.5" />
            Run localizer
          </Button>
        </div>
      </form>

      {pending && <AgentRunningOverlay kind="localizer" />}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-[11px] text-[var(--color-muted-foreground)] text-pretty">
          {hint}
        </p>
      )}
    </div>
  );
}
