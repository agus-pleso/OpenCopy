import Link from "next/link";
import { Megaphone, Layers, Sparkles, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCampaigns } from "@/server/actions/campaigns";
import { CampaignListCard } from "@/components/campaigns/campaign-list-card";

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[--color-muted-foreground]">
            Campaigns
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Multi-asset launches in one run.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[--color-muted-foreground]">
            One brief produces a coordinated bundle: blog intro, social posts,
            ad variants, email subject + body — all sharing voice + knowledge,
            each auditable and savable independently.
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Megaphone className="h-4 w-4" /> New campaign
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignListCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 grid gap-8 md:grid-cols-[1.2fr,1fr] md:gap-14">
      <div className="rounded-2xl border border-dashed border-[--color-border] bg-[--color-muted]/30 px-8 py-16 text-center md:py-20">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[--color-primary]/10 text-[--color-primary]">
          <Megaphone className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Your first campaign.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-[--color-muted-foreground]">
          Pick channels and a brand voice. The Campaign Planner decides the
          asset bundle, drafters work in parallel, the Voice Auditor scores
          everything.
        </p>
        <div className="mt-6 inline-flex">
          <Button asChild>
            <Link href="/campaigns/new">
              <Megaphone className="h-4 w-4" /> New campaign
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4">
        <Tip
          icon={Layers}
          title="One brief, many assets"
          body="Pick channels (blog · social · email · ad · landing). The planner decides exact quantity per channel and what differentiates each asset."
        />
        <Tip
          icon={Sparkles}
          title="Shared retrieval"
          body="Knowledge sources are queried once at the start and shared across the planner and every drafter — consistent grounding across the bundle."
        />
        <Tip
          icon={Bot}
          title="Audit per asset"
          body="Every drafted asset is voice-audited individually. Save the on-brand ones to your Library; discard or regenerate the misses."
        />
      </div>
    </div>
  );
}

function Tip({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
      <Icon className="h-4 w-4 text-[--color-primary]" />
      <h3 className="mt-2 font-display text-base tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-[--color-muted-foreground] text-pretty">
        {body}
      </p>
    </div>
  );
}
