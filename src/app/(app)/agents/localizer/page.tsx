import { Languages } from "lucide-react";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { LocalizerForm } from "@/components/agents/localizer-form";

export default async function LocalizerPage() {
  const { workspace } = await getCurrentWorkspace();

  const voices = await db
    .select({
      id: brandVoices.id,
      name: brandVoices.name,
      analyzedAt: brandVoices.analyzedAt,
    })
    .from(brandVoices)
    .where(eq(brandVoices.workspaceId, workspace.id));

  const voiceOptions = voices.map((v) => ({
    id: v.id,
    name: v.name,
    isAnalyzed: !!v.analyzedAt,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-center gap-3">
        <Languages className="h-5 w-5 text-[var(--color-primary)]" />
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Localizer agent
        </p>
      </div>
      <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
        New localization run.
      </h1>
      <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
        Transcreation, not translation. The Cultural Adapter flags idioms and
        formality calls; the Localizer transcreates; the Back-Translator gives
        you a literal sanity-check; the Voice Auditor validates the result stays
        on-brand.
      </p>

      <div className="mt-10">
        <LocalizerForm voices={voiceOptions} />
      </div>
    </div>
  );
}
