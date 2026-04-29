import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Megaphone, Quote, Sparkles } from "lucide-react";

import { getCampaign } from "@/server/actions/campaigns";
import { Badge } from "@/components/ui/badge";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { AssetCard } from "@/components/campaigns/asset-card";
import { formatDistanceShort } from "@/lib/utils";
import type { CampaignAsset, CampaignStatus, Channel } from "@/db/schema";

const STATUS_VARIANT: Record<
  CampaignStatus,
  "success" | "warning" | "destructive" | "muted" | "outline"
> = {
  succeeded: "success",
  running: "warning",
  queued: "muted",
  failed: "destructive",
  cancelled: "outline",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  ad: "Ads",
  email: "Email",
  landing: "Landing",
  social: "Social",
  blog: "Blog",
  headline: "Headlines",
  product_description: "Product",
  other: "Other",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const assets = campaign.assets ?? [];

  // Group assets by channel for nicer display.
  const byChannel: Record<string, CampaignAsset[]> = {};
  assets.forEach((a) => {
    (byChannel[a.channel] ??= []).push(a);
  });
  const orderedChannels = campaign.requestedChannels.filter(
    (c) => byChannel[c]?.length,
  );
  const otherChannels = Object.keys(byChannel).filter(
    (c) => !campaign.requestedChannels.includes(c as Channel),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[--color-muted-foreground] hover:text-[--color-foreground] transition"
      >
        <ChevronLeft className="h-3 w-3" /> Campaigns
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[--color-primary]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[--color-muted-foreground]">
              Campaign
            </p>
            <Badge
              variant={STATUS_VARIANT[campaign.status]}
              className="text-[10px] tracking-wider"
            >
              {campaign.status}
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
            {campaign.name}
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-[--color-muted-foreground]">
            {campaign.objective}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[--color-muted-foreground]">
            {campaign.voice && (
              <Link
                href={`/voices/${campaign.voice.id}`}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                Voice · {campaign.voice.name}
              </Link>
            )}
            <span>Locale · {campaign.locale.toUpperCase()}</span>
            <span>Created {formatDistanceShort(campaign.createdAt)}</span>
            {campaign.durationMs != null && (
              <span className="tabular-nums">
                Total · {(campaign.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        <CampaignActions campaignId={campaign.id} />
      </div>

      {campaign.status === "failed" && campaign.error && (
        <div className="mt-6 rounded-md border border-[--color-destructive]/30 bg-[--color-destructive]/5 px-4 py-3 text-sm text-[--color-destructive]">
          <p className="font-medium">Run failed</p>
          <p className="mt-1 font-mono text-[12px]">{campaign.error}</p>
        </div>
      )}

      {campaign.plan && (
        <section className="mt-8 rounded-2xl border border-[--color-border] bg-[--color-card] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.14em] text-[--color-muted-foreground]">
                Campaign strategy
              </p>
              <p className="mt-2 text-pretty text-[15px] leading-relaxed">
                {campaign.plan.strategy}
              </p>
              <div className="mt-4 flex items-start gap-2 rounded-md border-l-2 border-[--color-primary] bg-[--color-muted]/40 px-3 py-2">
                <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[--color-primary]" />
                <p className="text-pretty text-[15px] italic leading-snug">
                  {campaign.plan.hook}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-col gap-10">
        {[...orderedChannels, ...otherChannels].map((c) => {
          const channelAssets = byChannel[c] ?? [];
          if (channelAssets.length === 0) return null;
          return (
            <section key={c}>
              <div className="mb-4 flex items-center gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[--color-muted-foreground]">
                  {CHANNEL_LABEL[c as Channel] ?? c}
                </p>
                <span className="text-[11px] tabular-nums text-[--color-muted-foreground]">
                  {channelAssets.length} asset
                  {channelAssets.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {channelAssets.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            </section>
          );
        })}

        {assets.length === 0 && campaign.status !== "failed" && (
          <div className="rounded-lg border border-dashed border-[--color-border] bg-[--color-muted]/30 p-8 text-center text-sm text-[--color-muted-foreground]">
            No assets yet — drafters are still running.
          </div>
        )}
      </div>
    </div>
  );
}
