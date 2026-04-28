import { BookOpen, Sparkles, Search, FileText } from "lucide-react";
import { eq, and } from "drizzle-orm";

import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listKnowledgeSources } from "@/server/actions/knowledge";
import { NewSourceDialog } from "@/components/knowledge/new-source-dialog";
import { SourceListCard } from "@/components/knowledge/source-list-card";

export default async function KnowledgePage() {
  const { workspace } = await getCurrentWorkspace();

  const [sources, openaiKey] = await Promise.all([
    listKnowledgeSources(),
    db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.workspaceId, workspace.id),
          eq(apiKeys.provider, "openai"),
        ),
      )
      .limit(1),
  ]);

  const hasOpenAI = openaiKey.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[--color-muted-foreground]">
            Knowledge
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Ground every agent in real facts.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[--color-muted-foreground]">
            Paste product docs, FAQs, brand guidelines, customer research. We
            chunk, embed, and retrieve relevant excerpts at generation time —
            so the Copywriter and Localizer reference the truth, not generic
            assumptions.
          </p>
        </div>
        {hasOpenAI && <NewSourceDialog />}
      </div>

      {!hasOpenAI && <ConfigPrompt />}
      {hasOpenAI && sources.length === 0 && <EmptyState />}
      {hasOpenAI && sources.length > 0 && (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((s) => (
            <SourceListCard key={s.id} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigPrompt() {
  return (
    <div className="mt-10 flex flex-col items-start gap-4 rounded-xl border border-dashed border-[--color-border] bg-[--color-muted]/30 p-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
        <BookOpen className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-display text-2xl tracking-tight">
          Add an OpenAI key for embeddings.
        </h2>
        <p className="mt-2 max-w-xl text-pretty text-sm text-[--color-muted-foreground]">
          Knowledge base uses OpenAI&apos;s text-embedding-3-small (1536-dim,
          ~$0.02 per 1M tokens — pennies for typical brand docs). The key
          stays encrypted at rest and is only used for embeddings; chat
          generation continues to route through whichever model you picked in
          AI Providers.
        </p>
        <p className="mt-3 text-sm">
          <a
            href="/settings/ai"
            className="font-medium text-[--color-primary] underline underline-offset-2"
          >
            Open Settings → AI Providers
          </a>
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 grid gap-8 md:grid-cols-[1.2fr,1fr] md:gap-14">
      <div className="rounded-2xl border border-dashed border-[--color-border] bg-[--color-muted]/30 px-8 py-16 text-center md:py-20">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[--color-primary]/10 text-[--color-primary]">
          <BookOpen className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Your first source.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-[--color-muted-foreground]">
          Paste a product page, an FAQ, internal guidelines — anything your
          agents should know about.
        </p>
        <div className="mt-6 inline-flex">
          <NewSourceDialog />
        </div>
      </div>
      <div className="grid gap-4">
        <Tip
          icon={Search}
          title="Retrieval at run time"
          body="The Copywriter agent picks relevant chunks per brief and injects them into both planner and drafter context."
        />
        <Tip
          icon={Sparkles}
          title="One source, many uses"
          body="Tag sources (product · pricing · FAQ) and pick which to consult per run — or let the agent pull from everything."
        />
        <Tip
          icon={FileText}
          title="Ground, don't hallucinate"
          body="Every retrieved chunk is verbatim. Drafters are instructed to use facts only when they appear in retrieved excerpts."
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
