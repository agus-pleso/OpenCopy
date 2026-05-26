"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, X, ScanText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ComposeContextBar,
  type ComposeContextValue,
} from "@/components/compose/compose-context-bar";
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
  // Channels with custom component schemas. The drafter pulls the schema
  // from `channel_definition` at run time and produces named sections
  // (subject, body, cta, etc.) instead of a single block. Edit the schemas
  // in Settings → Channels.
  { value: "email-marketing", label: "Email · marketing", hint: "subject + preheader + body + CTA" },
  { value: "email-transactional", label: "Email · transactional", hint: "subject + body + (optional CTA)" },
  { value: "ig-post", label: "Instagram · post", hint: "caption + hashtags" },
  { value: "ig-story", label: "Instagram · story", hint: "headline + subline + sticker" },
  { value: "fb-ad", label: "Facebook ad", hint: "headline + primary text + description + CTA" },
  { value: "landing-hero", label: "Landing · hero", hint: "headline + sub + 2 CTAs" },
  { value: "blog", label: "Blog post", hint: "title + deck + body" },
  { value: "sms", label: "SMS", hint: "≤ 160 chars" },
  { value: "push", label: "Push notification", hint: "title + body" },
  // Legacy single-shot channels — kept for back-compat with old campaigns.
  { value: "landing", label: "Landing (legacy)", hint: "headline + sub" },
  { value: "email", label: "Email (legacy)", hint: "subject + body" },
  { value: "social", label: "Social (legacy)", hint: "1 paragraph" },
  { value: "ad", label: "Ad (legacy)", hint: "1–2 lines" },
  { value: "headline", label: "Headline (legacy)", hint: "≤ 80 chars" },
  { value: "product_description", label: "Product description (legacy)", hint: "60–100 words" },
  { value: "other", label: "Other (legacy)", hint: "as specified" },
];

export function CampaignForm({ voices, sources }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const usableVoices = voices.filter((v) => v.isAnalyzed);
  const usableSourceIds = new Set(
    sources.filter((s) => s.status === "ready").map((s) => s.id),
  );

  const [name, setName] = React.useState("");

  // Initial state honours URL params from the unified "+ New" dialog.
  const initialVoiceId = (() => {
    const fromUrl = searchParams.get("voiceId");
    if (fromUrl && usableVoices.some((v) => v.id === fromUrl)) return fromUrl;
    return usableVoices[0]?.id ?? null;
  })();
  const initialLocale = (() => {
    const fromUrl = searchParams.get("locale");
    if (fromUrl && ["en", "pl", "ro", "uk"].includes(fromUrl)) {
      return fromUrl as Locale;
    }
    return (usableVoices.find((v) => v.id === initialVoiceId)?.defaultLocale ??
      usableVoices[0]?.defaultLocale ??
      "en") as Locale;
  })();
  const initialSourceIds = (() => {
    const raw = searchParams.get("sourceIds");
    if (!raw) return [];
    return raw.split(",").filter((id) => usableSourceIds.has(id));
  })();

  const [compose, setCompose] = React.useState<ComposeContextValue>({
    voiceId: initialVoiceId,
    locale: initialLocale,
    sourceIds: initialSourceIds,
  });
  const [objective, setObjective] = React.useState("");
  const [productInfo, setProductInfo] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [channels, setChannels] = React.useState<Channel[]>([
    "blog",
    "social",
    "ad",
  ]);

  const toggleChannel = (c: Channel) => {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
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
          voiceId: compose.voiceId ?? undefined,
          locale: compose.locale,
          objective: objective.trim(),
          audienceOverride: audience.trim() || undefined,
          productInfo: productInfo.trim() || undefined,
          requestedChannels: channels,
          sourceIds: compose.sourceIds.length > 0 ? compose.sourceIds : undefined,
        });
        router.push(`/campaigns/${campaignId}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-6">
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

        <ComposeContextBar
          value={compose}
          onChange={setCompose}
          voices={voices}
          sources={sources}
          tourPrefix="campaigns"
        />

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

        <div className="grid gap-4 md:grid-cols-2">
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
        </div>

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
                      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
                  )}
                >
                  <span>{c.label}</span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">
                    {c.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        {compose.voiceId === null && (
          <div className="inline-flex items-center gap-2 rounded-md border border-dashed border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
            <ScanText className="h-3.5 w-3.5" />
            <span>
              Without a voice, assets will be drafted but not voice-audited.
              Attach a voice for ship-ready output.
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setName("");
              setObjective("");
              setProductInfo("");
              setAudience("");
              setCompose((c) => ({ ...c, sourceIds: [] }));
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
