import "server-only";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  libraryEntries,
  type Channel,
  type Locale,
} from "@/db/schema";

/**
 * Retrieve hand-curated reference exemplars for the copywriter agent.
 *
 * These are MANUAL library entries (V2.4) — human-written best examples the
 * team has hand-picked as style anchors. Distinct from the KB retrieval lane
 * (which uses pgvector similarity over factual sources). The corpus here is
 * intentionally small and curated, so we don't embed/vector-search; we just
 * filter by (workspace, channel, locale, voice scope) and list the most
 * recent N.
 *
 * The drafter prompt injects the formatted result as a "Stylistic exemplars"
 * section between the angle block and the knowledge block. Exemplars
 * answer "what does on-brand work look like for this channel/locale";
 * KB chunks answer "what factual claims am I allowed to make".
 */

export interface ExemplarRetrievalOptions {
  workspaceId: string;
  /** Filter to exemplars saved against this channel. Falls back to "any
   * channel" exemplars (channel = NULL) so a small corpus still surfaces
   * something even when channel-specific exemplars don't exist yet. */
  channel?: Channel;
  /** Locale to match. NULL-channel exemplars across locales are also
   * eligible if no locale-specific match is found. */
  locale?: Locale;
  /** Voice scope. When provided, exemplars saved under this voice rank
   * before voice-agnostic ones. */
  voiceId?: string | null;
  /** Cap. Default 4 — enough for the model to generalise from, few enough
   * not to dominate the context budget. */
  maxCount?: number;
}

export interface ExemplarHit {
  entryId: string;
  content: string;
  title: string | null;
  channel: Channel | null;
  locale: Locale;
}

export async function retrieveExemplars(
  opts: ExemplarRetrievalOptions,
): Promise<ExemplarHit[]> {
  const max = opts.maxCount ?? 4;

  const conditions = [
    eq(libraryEntries.workspaceId, opts.workspaceId),
    eq(libraryEntries.source, "manual"),
  ];
  if (opts.channel) conditions.push(eq(libraryEntries.channel, opts.channel));
  if (opts.locale) conditions.push(eq(libraryEntries.locale, opts.locale));
  if (opts.voiceId) conditions.push(eq(libraryEntries.voiceId, opts.voiceId));

  const rows = await db.query.libraryEntries.findMany({
    where: and(...conditions),
    orderBy: [desc(libraryEntries.createdAt)],
    limit: max,
    columns: {
      id: true,
      content: true,
      title: true,
      channel: true,
      locale: true,
    },
  });

  return rows.map((r) => ({
    entryId: r.id,
    content: r.content,
    title: r.title,
    channel: r.channel,
    locale: r.locale,
  }));
}

/**
 * Format exemplar hits as a prompt block. Empty input → empty string so the
 * caller can do `if (text) lines.push(text)` without a guard.
 */
export function formatExemplarsForPrompt(hits: ExemplarHit[]): string {
  if (hits.length === 0) return "";
  const lines: string[] = [];
  lines.push("# Stylistic exemplars from your library");
  lines.push(
    "These are human-written reference pieces from this team's library. " +
      "Use them as STYLE / TONE anchors only — match how they feel, not what " +
      "they claim. Do not copy their content; do not borrow specific facts " +
      "from them. They show what on-brand looks like in this voice + channel.",
  );
  lines.push("");
  hits.forEach((h, i) => {
    const label = h.title ? `Exemplar ${i + 1} — ${h.title}` : `Exemplar ${i + 1}`;
    const meta: string[] = [];
    if (h.channel) meta.push(`channel: ${h.channel}`);
    meta.push(`locale: ${h.locale}`);
    lines.push(`## ${label} (${meta.join(" · ")})`);
    lines.push(h.content.trim());
    lines.push("");
  });
  return lines.join("\n").trim();
}
