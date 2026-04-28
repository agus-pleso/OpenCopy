"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, ArrowRight } from "lucide-react";
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

  const [voiceId, setVoiceId] = React.useState<string>("__none");
  const [sourceLocale, setSourceLocale] = React.useState<Locale>("en");
  const [targetLocale, setTargetLocale] = React.useState<Locale>("pl");
  const [sourceText, setSourceText] = React.useState("");
  const [contextHint, setContextHint] = React.useState("");

  const usable = voices.filter((v) => v.isAnalyzed);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceLocale === targetLocale) {
      toast.error("Source and target locale must differ.");
      return;
    }
    if (sourceText.trim().length < 20) {
      toast.error("Paste at least 20 characters of source copy.");
      return;
    }
    startTransition(async () => {
      try {
        const { runId } = await startLocalizerRun({
          voiceId: voiceId !== "__none" ? voiceId : undefined,
          sourceLocale,
          targetLocale,
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
                className="min-h-[200px] font-serif"
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

            <div className="flex items-center justify-center text-[--color-muted-foreground]">
              <ArrowRight className="h-4 w-4" />
            </div>

            <Field label="Target locale" hint="Where the copy needs to land.">
              <Select
                value={targetLocale}
                onValueChange={(v) => setTargetLocale(v as Locale)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.filter((l) => l.value !== sourceLocale).map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Brand voice"
            hint="Optional. With a voice the auditor checks that the target copy stays on-brand."
          >
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No voice — translate cleanly</SelectItem>
                {usable.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

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
        </div>

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
      <Label className="text-xs uppercase tracking-[0.14em] text-[--color-muted-foreground]">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-[11px] text-[--color-muted-foreground] text-pretty">
          {hint}
        </p>
      )}
    </div>
  );
}
