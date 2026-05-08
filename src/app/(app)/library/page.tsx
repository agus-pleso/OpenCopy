import Link from "next/link";
import { Library, Bot, Languages } from "lucide-react";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listLibrary } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { LibraryBoard } from "@/components/library/library-board";
import { ManualLibraryEntryDialog } from "@/components/library/manual-entry-dialog";

export default async function LibraryPage() {
  const items = await listLibrary();
  // Voices are needed for the manual-entry dialog's voice-scope picker.
  const { workspace } = await getCurrentWorkspace();
  const voices = await db
    .select({ id: brandVoices.id, name: brandVoices.name })
    .from(brandVoices)
    .where(eq(brandVoices.workspaceId, workspace.id));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Library
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Approved copy, organized.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
            Variants from agent runs, chat replies, document selections, and
            hand-picked human exemplars — everything searchable, copyable, and
            traceable to its source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManualLibraryEntryDialog voices={voices} />
          <Button asChild variant="outline">
            <Link href="/agents">Run a new agent</Link>
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState voicesAvailable={voices.length > 0} voices={voices} />
      ) : (
        <LibraryBoard items={items} />
      )}
    </div>
  );
}

function EmptyState({
  voices,
}: {
  voicesAvailable: boolean;
  voices: { id: string; name: string }[];
}) {
  return (
    <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-8 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <Library className="h-5 w-5" />
      </div>
      <h2 className="mt-5 font-display text-xl tracking-tight">
        Nothing saved yet
      </h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--color-muted-foreground)] text-pretty">
        Run a Copywriter or Localizer agent and click <em>Save to library</em>
        {" "}on the variants you like, save chat replies and document selections
        from anywhere in the app, or seed the library with hand-picked
        human-written exemplars to anchor the agent&apos;s style.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <ManualLibraryEntryDialog voices={voices} />
        <Button asChild size="sm" variant="outline">
          <Link href="/agents/copywriter">
            <Bot className="h-3.5 w-3.5" /> Copywriter
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/agents/localizer">
            <Languages className="h-3.5 w-3.5" /> Localizer
          </Link>
        </Button>
      </div>
    </div>
  );
}
