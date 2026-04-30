import Link from "next/link";
import { ChevronLeft, Megaphone } from "lucide-react";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices, kbSources } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { CampaignForm } from "@/components/campaigns/campaign-form";

export default async function NewCampaignPage() {
  const { workspace } = await getCurrentWorkspace();

  const [voices, sources] = await Promise.all([
    db
      .select({
        id: brandVoices.id,
        name: brandVoices.name,
        defaultLocale: brandVoices.defaultLocale,
        analyzedAt: brandVoices.analyzedAt,
      })
      .from(brandVoices)
      .where(eq(brandVoices.workspaceId, workspace.id)),
    db
      .select({
        id: kbSources.id,
        name: kbSources.name,
        chunkCount: kbSources.chunkCount,
        status: kbSources.status,
      })
      .from(kbSources)
      .where(
        and(
          eq(kbSources.workspaceId, workspace.id),
          eq(kbSources.status, "ready"),
        ),
      ),
  ]);

  const voiceOptions = voices.map((v) => ({
    id: v.id,
    name: v.name,
    defaultLocale: v.defaultLocale,
    isAnalyzed: !!v.analyzedAt,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
      >
        <ChevronLeft className="h-3 w-3" /> Campaigns
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <Megaphone className="h-5 w-5 text-[var(--color-primary)]" />
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Campaign brief
        </p>
      </div>
      <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
        New campaign run.
      </h1>
      <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
        The Campaign Planner reads the brief and decides the asset list — a
        unified strategy + hook with one asset per row in the plan. Drafters
        run in parallel, the Voice Auditor scores everything.
      </p>

      <div className="mt-10">
        <CampaignForm voices={voiceOptions} sources={sources} />
      </div>
    </div>
  );
}
