import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandVoices } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { getDocument } from "@/server/actions/documents";
import { DocumentShell } from "@/components/documents/document-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();

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

  return <DocumentShell document={doc} voices={voiceOptions} />;
}
