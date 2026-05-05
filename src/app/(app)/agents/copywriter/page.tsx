import { Bot } from "lucide-react";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices, kbSources } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { CopywriterForm } from "@/components/agents/copywriter-form";

export default async function CopywriterPage() {
  const { workspace } = await getCurrentWorkspace();

  const [voices, sources] = await Promise.all([
    db
      .select({
        id: brandVoices.id,
        name: brandVoices.name,
        defaultLocale: brandVoices.defaultLocale,
        status: brandVoices.status,
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
        tags: kbSources.tags,
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
    status: v.status,
    isAnalyzed: !!v.analyzedAt,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-[var(--color-primary)]" />
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Copywriter agent
        </p>
      </div>
      <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
        New copywriter run.
      </h1>
      <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
        The Planner picks N differentiated angles. Drafters chase each angle in
        parallel. The Voice Auditor scores them against your brand voice. You
        decide which to keep.
      </p>

      <div className="mt-10">
        <CopywriterForm voices={voiceOptions} sources={sources} />
      </div>
    </div>
  );
}
