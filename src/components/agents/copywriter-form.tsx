"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startCopywriterRun } from "@/server/actions/agents";
import { AgentRunningOverlay } from "./agent-running-overlay";
import type { Locale, Channel } from "@/db/schema";

interface VoiceOption {
  id: string;
  name: string;
  defaultLocale: Locale;
  status: string;
  isAnalyzed: boolean;
}

interface Props {
  voices: VoiceOption[];
}

const CHANNELS: { value: Channel; label: string; lengthHint: string }[] = [
  { value: "ad", label: "Ad", lengthHint: "1–2 lines" },
  { value: "headline", label: "Headline", lengthHint: "≤ 80 chars" },
  { value: "social", label: "Social post", lengthHint: "1 paragraph" },
  { value: "email", label: "Email", lengthHint: "subject + body" },
  { value: "landing", label: "Landing hero", lengthHint: "headline + sub" },
  { value: "blog", label: "Blog intro", lengthHint: "100–150 words" },
  { value: "product_description", label: "Product description", lengthHint: "60–100 words" },
  { value: "other", label: "Other", lengthHint: "as specified" },
];

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

export function CopywriterForm({ voices }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const usable = voices.filter((v) => v.isAnalyzed);

  const [voiceId, setVoiceId] = React.useState<string>(usable[0]?.id ?? "");
  const [channel, setChannel] = React.useState<Channel>("ad");
  const [locale, setLocale] = React.useState<Locale>(
    usable[0]?.defaultLocale ?? "en",
  );
  const [objective, setObjective] = React.useState("");
  const [productInfo, setProductInfo] = React.useState("");
  const [length, setLength] = React.useState("");
  const [variantCount, setVariantCount] = React.useState(3);
  const [keywordsRaw, setKeywordsRaw] = React.useState("");

  const channelMeta = CHANNELS.find((c) => c.value === channel);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceId) {
      toast.error("Pick an analyzed brand voice first.");
      return;
    }
    if (objective.trim().length < 10) {
      toast.error("Objective is too short — be specific.");
      return;
    }
    const keywords = keywordsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const { runId } = await startCopywriterRun({
          voiceId,
          channel,
          locale,
          objective: objective.trim(),
          productInfo: productInfo.trim() || undefined,
          length: length.trim() || channelMeta?.lengthHint || undefined,
          variantCount,
          keywords: keywords.length > 0 ? keywords : undefined,
        });
        router.push(`/agents/runs/${runId}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  if (usable.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[--color-border] bg-[--color-muted]/30 px-8 py-16 text-center">
        <h3 className="font-display text-xl tracking-tight">
          Define a brand voice first
        </h3>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-[--color-muted-foreground]">
          The Copywriter agent reads from a brand voice. Create one in{" "}
          <Link href="/voices" className="underline underline-offset-2">
            Brand voices
          </Link>{" "}
          and run the analyzer, then come back.
        </p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-2">
        <Field label="Brand voice" hint="Drives every drafter and the auditor.">
          <Select value={voiceId} onValueChange={setVoiceId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a voice" />
            </SelectTrigger>
            <SelectContent>
              {usable.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Channel" hint={channelMeta?.lengthHint ?? ""}>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                  <span className="ml-2 text-xs text-[--color-muted-foreground]">
                    {c.lengthHint}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Objective"
            hint="What this copy needs to do. Be specific — 'Drive trial signups for the Pro plan' beats 'Be persuasive'."
          >
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Convert mid-market B2B founders to start a 14-day free trial of the Pro plan, with the angle that they save 6 hours/week on reporting."
              className="min-h-[100px]"
              required
              minLength={10}
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field
            label="Product / service info"
            hint="Optional. Drop in feature names, value props, key specs the copy should know."
          >
            <Textarea
              value={productInfo}
              onChange={(e) => setProductInfo(e.target.value)}
              placeholder="What does the product actually do? Pricing? Audience pain points it solves?"
              className="min-h-[80px]"
            />
          </Field>
        </div>

        <Field label="Locale" hint="Affects voice locale notes if defined.">
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
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

        <Field label="Variants" hint="1–5. More = wider angle exploration.">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setVariantCount(n)}
                className={
                  n === variantCount
                    ? "h-9 w-9 rounded-md bg-[--color-primary] text-[--color-primary-foreground] font-medium"
                    : "h-9 w-9 rounded-md border border-[--color-border] hover:bg-[--color-accent]"
                }
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Length override"
          hint={`Optional. Defaults to "${channelMeta?.lengthHint}".`}
        >
          <Input
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder={channelMeta?.lengthHint}
          />
        </Field>

        <Field
          label="Keywords"
          hint="Optional. Comma-separated. The drafters will weave these in."
        >
          <Input
            value={keywordsRaw}
            onChange={(e) => setKeywordsRaw(e.target.value)}
            placeholder="e.g. observability, postgres, self-hosted"
          />
        </Field>

        <div className="md:col-span-2 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setObjective("");
              setProductInfo("");
              setKeywordsRaw("");
              setLength("");
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button type="submit" disabled={pending}>
            <Sparkles className="h-3.5 w-3.5" />
            Run copywriter
          </Button>
        </div>
      </form>

      {pending && <AgentRunningOverlay kind="copywriter" />}
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
