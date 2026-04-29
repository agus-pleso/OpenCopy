import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices, kbSources } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { getChatThread } from "@/server/actions/chat";
import { ChatShell } from "@/components/chat/chat-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatThreadPage({ params }: PageProps) {
  const { id } = await params;
  const thread = await getChatThread(id);
  if (!thread) notFound();

  const { workspace } = await getCurrentWorkspace();
  const [voices, sources] = await Promise.all([
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

  return (
    <ChatShell
      threadId={thread.id}
      title={thread.title}
      voiceId={thread.voiceId}
      voiceName={thread.voice?.name ?? null}
      locale={thread.locale}
      sourceIds={thread.sourceIds}
      pinned={thread.pinned}
      initialMessages={thread.messages ?? []}
      voices={voiceOptions}
      sources={sources}
    />
  );
}
