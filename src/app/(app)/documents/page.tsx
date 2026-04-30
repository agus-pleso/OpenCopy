import { FileText, Sparkles, ScanText } from "lucide-react";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listDocuments } from "@/server/actions/documents";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { DocumentListCard } from "@/components/documents/document-list-card";

export default async function DocumentsPage() {
  const { workspace } = await getCurrentWorkspace();

  const [docs, voices] = await Promise.all([
    listDocuments(),
    db
      .select({
        id: brandVoices.id,
        name: brandVoices.name,
        analyzedAt: brandVoices.analyzedAt,
      })
      .from(brandVoices)
      .where(eq(brandVoices.workspaceId, workspace.id)),
  ]);

  const voiceOptions = voices.map((v) => ({
    id: v.id,
    name: v.name,
    isAnalyzed: !!v.analyzedAt,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Documents
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Write long. Edit with agents.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
            A focused writing surface with AI commands at your cursor. Type{" "}
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 font-mono text-[11px]">
              /
            </kbd>{" "}
            to compose, continue, rephrase, expand, shorten, or change tone.
            Highlight text for instant bubble actions.
          </p>
        </div>
        <NewDocumentDialog voices={voiceOptions} />
      </div>

      {docs.length === 0 ? (
        <EmptyState voiceOptions={voiceOptions} />
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <DocumentListCard key={d.id} document={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  voiceOptions,
}: {
  voiceOptions: { id: string; name: string; isAnalyzed: boolean }[];
}) {
  return (
    <div className="mt-12 grid gap-8 md:grid-cols-[1.2fr_1fr] md:gap-14">
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-8 py-16 text-center md:py-20">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <FileText className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Your first document.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-[var(--color-muted-foreground)]">
          Start blank or pick a brand voice — every AI command in this editor
          reads from your voice.
        </p>
        <div className="mt-6 inline-flex">
          <NewDocumentDialog voices={voiceOptions} />
        </div>
      </div>
      <div className="grid gap-4">
        <Tip
          icon={Sparkles}
          title={"Type / to invoke commands"}
          body="Compose, continue writing, rephrase, expand, shorten, explain, change tone — all at the cursor."
        />
        <Tip
          icon={ScanText}
          title="Brand voice in every command"
          body="Attach a voice to the document and every command honors its do's, don'ts, tone, and vocabulary."
        />
        <Tip
          icon={FileText}
          title="Highlight for instant edits"
          body="Selection bubble menu: Improve · Rephrase · Fix grammar · Shorter · Longer."
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
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <Icon className="h-4 w-4 text-[var(--color-primary)]" />
      <h3 className="mt-2 font-display text-base tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)] text-pretty">
        {body}
      </p>
    </div>
  );
}
