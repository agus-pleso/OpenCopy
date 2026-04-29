"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, X, BookOpen, ScanText } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { startCampaignRun } from "@/server/actions/campaigns";
import { AgentRunningOverlay } from "@/components/agents/agent-running-overlay";
import { cn } from "@/lib/utils";
import type { Locale, Channel } from "@/db/schema";

interface VoiceOption {
  id: string;
  name: string;
  defaultLocale: Locale;
  isAnalyzed: boolean;
}

interface SourceOption {
  id: string;
  name: string;
  chunkCount: number;
  status: string;
}

interface Props {
  voices: VoiceOption[];
  sources: SourceOption[];
}

const CHANNELS: { value: Channel; label: string; hint: string }[] = [
  { value: "blog", label: "Blog intro", hint: "100–150 words" },
  { value: "landing", label: "Landing hero", hint: "headline + sub" },
  { value: "email", label: "Email", hint: "subject + body" },
  { value: "social", label: "Social post", hint: "1 paragraph" },
  { value: "ad", label: "Ad", hint: "1–2 lines" },
  { value: "headline", label: "Headline", hint: "≤ 80 chars" },
  { value: "product_description", label: "Product description", hint: "60–100 words" },
  { value: "other", label: "Other", hint: "as specified" },
];

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

export function CampaignForm({ voices, sources }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const usableVoices = voices.filter((v) => v.isAnalyzed);
  const usableSources = sources.filter((s) => s.status === "ready");

  const [name, setName] = React.useState("");
  const [voiceId, setVoiceId] = React.useState<string>(
    usableVoices[0]?.id ?? "__none",
  );
  const [locale, setLocale] = React.useState<Locale>(
    usableVoices[0]?.defaultLocale ?? "en",
  );
  const [objective, setObjective] = React.useState("");
  const [productInfo, setProductInfo] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [channels, setChannels] = React.useState<Channel[]>([
    "blog",
    "social",
    "ad",
  ]);
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>([]);

  const toggleChannel = (c: Channel) => {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Give the campaign a name.");
      return;
    }
    if (objective.trim().length < 10) {
      toast.error("Objective is too short — be specific about what the campaign needs to do.");
      return;
    }
    if (channels.length === 0) {
      toast.error("Pick at least one channel.");
      return;
    }
    startTransition(async () => {
      try {
        const { campaignId } = await startCampaignRun({
          name: name.trim(),
          voiceId: voiceId !== "__none" ? voiceId : undefined,
          locale,
          objective: objective.trim(),
          audienceOverride: audience.trim() || undefined,
          productInfo: productInfo.trim() || undefined,
          requestedChannels: channels,
          sourceIds: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
        });
        router.push(`/campaigns/${campaignId}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field
            label="Campaign name"
            hint="Internal label — what you'll search for in the list later."
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pro plan launch — Q3"
              required
              minLength={2}
              maxLength={160}
              className="text-base"
            />
          </Field>
        </div>

        <Field label="Brand voice" hint="Drives every drafter and the auditor.">
          <Select value={voiceId} onValueChange={setVoiceId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a voice" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No voice</SelectItem>
              {usableVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Locale" hint="Locale for every asset.">
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

        <div className="md:col-span-2">
          <Field
            label="Objective"
            hint="What the campaign needs to accomplish. Specific verb + measurable outcome beats vague ambition."
          >
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Drive Pro-plan trial signups for mid-market B2B founders, with the angle that Pro saves 6 hours/week on reporting."
              className="min-h-[100px]"
              required
              minLength={10}
            />
          </Field>
        </div>

        <Field label="Audience override (optional)">
          <Input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Overrides the voice's audience for this campaign."
          />
        </Field>

        <Field label="Product info (optional)" hint="Feature names, pricing, value props.">
          <Input
            value={productInfo}
            onChange={(e) => setProductInfo(e.target.value)}
            placeholder="What does the product actually do?"
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Channels"
            hint="Pick which channels the campaign should produce assets for. The planner decides exact quantity per channel."
          >
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const selected = channels.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleChannel(c.value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      selected
                        ? "border-[--color-primary]/40 bg-[--color-primary]/10 text-[--color-primary]"
                        : "border-[--color-border] bg-[--color-background] text-[--color-foreground] hover:bg-[--color-accent]",
                    )}
                  >
                    <span>{c.label}</span>
                    <span className="text-[10px] text-[--color-muted-foreground]">
                      {c.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        {usableSources.length > 0 && (
          <div className="md:col-span-2 rounded-lg border border-[--color-border] bg-[--color-card] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[--color-primary]" />
                <Label className="text-xs uppercase tracking-[0.14em] text-[--color-muted-foreground]">
                  Knowledge sources
                </Label>
                {selectedSourceIds.length > 0 && (
                  <Badge variant="muted" className="text-[10px] tracking-wider">
                    {selectedSourceIds.length} selected
                  </Badge>
                )}
              </div>
              <Link
                href="/knowledge"
                className="text-[11px] uppercase tracking-wider text-[--color-muted-foreground] hover:text-[--color-foreground] transition"
              >
                Manage
              </Link>
            </div>
            <p className="mt-2 text-[11px] text-[--color-muted-foreground]">
              Retrieved chunks are shared across the campaign planner and every
              asset drafter — top 10 most relevant per run.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {usableSources.map((s) => {
                const selected = selectedSourceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSource(s.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition",
                      selected
                        ? "border-[--color-primary]/40 bg-[--color-primary]/10 text-[--color-primary]"
                        : "border-[--color-border] bg-[--color-background] text-[--color-foreground] hover:bg-[--color-accent]",
                    )}
                  >
                    <span>{s.name}</span>
                    <span className="text-[10px] tabular-nums text-[--color-muted-foreground]">
                      {s.chunkCount}c
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {voiceId === "__none" && (
          <div className="md:col-span-2 inline-flex items-center gap-2 rounded-md border border-dashed border-[--color-warning]/40 bg-[--color-warning]/10 px-3 py-2 text-xs text-[--color-warning]">
            <ScanText className="h-3.5 w-3.5" />
            <span>
              Without a voice, assets will be drafted but not voice-audited.
              Attach a voice for ship-ready output.
            </span>
          </div>
        )}

        <div className="md:col-span-2 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setName("");
              setObjective("");
              setProductInfo("");
              setAudience("");
              setSelectedSourceIds([]);
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button type="submit" disabled={pending}>
            <Sparkles className="h-3.5 w-3.5" />
            Run campaign
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
