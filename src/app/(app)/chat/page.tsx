import { MessageSquare, Sparkles, ScanText, BookOpen } from "lucide-react";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices, kbSources } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listChatThreads } from "@/server/actions/chat";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { ThreadListCard } from "@/components/chat/thread-list-card";

export default async function ChatPage() {
  const { workspace } = await getCurrentWorkspace();

  const [threads, voices, sources] = await Promise.all([
    listChatThreads(),
    db
      .select({
        id: brandVoices.id,
        name: brandVoices.name,
        analyzedAt: brandVoices.analyzedAt,
      })
      .from(brandVoices)
      .where(eq(brandVoices.workspaceId, workspace.id)),
    db
      .select({
        id: kbSources.id,
        name: kbSources.name,
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
    isAnalyzed: !!v.analyzedAt,
  }));

  // Decorate threads with voice info for the list cards.
  const voiceMap = new Map(voices.map((v) => [v.id, v.name]));
  const decorated = threads.map((t) => ({
    ...t,
    voice: t.voiceId
      ? { id: t.voiceId, name: voiceMap.get(t.voiceId) ?? "Unknown voice" }
      : null,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Chat
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Brainstorm. Draft. Refine.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
            A conversational surface that composes everything OpenCopy knows —
            brand voice, knowledge base, your model defaults — into one chat.
            Threads are workspace-scoped and per-user persistent.
          </p>
        </div>
        <NewChatDialog voices={voiceOptions} sources={sources} />
      </div>

      {decorated.length === 0 ? (
        <EmptyState voices={voiceOptions} sources={sources} />
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {decorated.map((t) => (
            <ThreadListCard key={t.id} thread={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  voices,
  sources,
}: {
  voices: { id: string; name: string; isAnalyzed: boolean }[];
  sources: { id: string; name: string; status: string }[];
}) {
  return (
    <div className="mt-12 grid gap-8 md:grid-cols-[1.2fr_1fr] md:gap-14">
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-8 py-16 text-center md:py-20">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <MessageSquare className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Your first chat.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-[var(--color-muted-foreground)]">
          Pick a brand voice + knowledge sources up front, then ask anything —
          the assistant will stay grounded across turns.
        </p>
        <div className="mt-6 inline-flex">
          <NewChatDialog voices={voices} sources={sources} />
        </div>
      </div>
      <div className="grid gap-4">
        <Tip
          icon={ScanText}
          title="Voice-aware by default"
          body="Every turn injects your voice card into the system prompt. The assistant stays in your tone, follows your do's and don'ts."
        />
        <Tip
          icon={BookOpen}
          title="Retrieval per turn"
          body="Attach knowledge sources at thread creation. Each user message triggers a fresh retrieval — answers stay grounded in your facts."
        />
        <Tip
          icon={Sparkles}
          title="Model picker, free choice"
          body="Defaults to your drafting model. Threads can override — pick a cheaper model for brainstorms, the strongest for final drafts."
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
