import Link from "next/link";
import { Megaphone, Layers, Loader2, ScanText } from "lucide-react";
import { cn, formatDistanceShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Campaign, Channel } from "@/db/schema";

const STATUS_VARIANT: Record<
  Campaign["status"],
  "success" | "warning" | "destructive" | "muted" | "outline"
> = {
  succeeded: "success",
  running: "warning",
  queued: "muted",
  failed: "destructive",
  cancelled: "outline",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  ad: "Ad",
  email: "Email",
  landing: "Landing",
  social: "Social",
  blog: "Blog",
  headline: "Headline",
  product_description: "Product",
  other: "Other",
  "email-marketing": "Email · marketing",
  "email-transactional": "Email · transactional",
  "ig-post": "IG · post",
  "ig-story": "IG · story",
  "fb-ad": "FB · ad",
  "landing-hero": "Landing · hero",
  sms: "SMS",
  push: "Push",
};

interface Props {
  campaign: Campaign & {
    voice?: { id: string; name: string } | null;
    assetCount: number;
  };
}

export function CampaignListCard({ campaign }: Props) {
  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        "transition hover:border-[var(--color-primary)]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Megaphone className="h-4 w-4" />
        </div>
        <Badge
          variant={STATUS_VARIANT[campaign.status]}
          className="text-[10px] tracking-wider"
        >
          {campaign.status === "running" && (
            <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
          )}
          {campaign.status}
        </Badge>
      </div>

      <div className="min-h-[3rem]">
        <h3 className="font-display text-lg tracking-tight line-clamp-1">
          {campaign.name}
        </h3>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2 text-pretty">
          {campaign.objective}
        </p>
      </div>

      {campaign.requestedChannels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {campaign.requestedChannels.slice(0, 5).map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-medium tracking-tight"
            >
              {CHANNEL_LABEL[c]}
            </span>
          ))}
          {campaign.requestedChannels.length > 5 && (
            <span className="text-[10px] text-[var(--color-muted-foreground)]">
              +{campaign.requestedChannels.length - 5}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-[var(--color-border)]/60 pt-3 text-xs text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Layers className="h-3 w-3" /> {campaign.assetCount} asset
          {campaign.assetCount === 1 ? "" : "s"}
        </span>
        {campaign.voice && (
          <span className="inline-flex items-center gap-1">
            <ScanText className="h-3 w-3" />
            {campaign.voice.name}
          </span>
        )}
        <span className="ml-auto">{formatDistanceShort(campaign.createdAt)}</span>
      </div>
    </Link>
  );
}
