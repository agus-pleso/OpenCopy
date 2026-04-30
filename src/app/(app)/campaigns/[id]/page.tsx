import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Megaphone } from "lucide-react";

import { getCampaign } from "@/server/actions/campaigns";
import { Badge } from "@/components/ui/badge";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignAssetsBrowser } from "@/components/campaigns/campaign-assets-browser";
import { CampaignStrategyPanel } from "@/components/campaigns/campaign-strategy-panel";
import { formatDistanceShort } from "@/lib/utils";
import type { CampaignStatus } from "@/db/schema";

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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const assets = campaign.assets ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
      >
        <ChevronLeft className="h-3 w-3" /> Campaigns
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[var(--color-primary)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
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
          <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
            {campaign.objective}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
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
        <div className="mt-6 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-4 py-3 text-sm text-[var(--color-destructive)]">
          <p className="font-medium">Run failed</p>
          <p className="mt-1 font-mono text-[12px]">{campaign.error}</p>
        </div>
      )}

      {campaign.plan && (
        <div className="mt-8">
          <CampaignStrategyPanel
            strategy={campaign.plan.strategy}
            hook={campaign.plan.hook}
          />
        </div>
      )}

      <div className="mt-8">
        <CampaignAssetsBrowser
          assets={assets}
          requestedChannels={campaign.requestedChannels}
        />
      </div>
    </div>
  );
}
