import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  agentRunSteps,
  agentRuns,
  brandVoices,
  campaignAssets,
  campaigns,
  chatMessages,
  chatThreads,
  copyVariants,
  documents,
  kbChunks,
  kbSources,
  members,
  modelDefaults,
  users,
  voiceAudits,
  voiceSamples,
  workspaces,
} from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;

import {
  FORMAT_ID,
  IV_BYTES,
  KDF,
  KDF_ITERATIONS,
  NOT_INCLUDED,
  SALT_BYTES,
  SCHEMA_VERSION,
  type Manifest,
} from "./workspace-format";

/**
 * Compact binary container for chunk embeddings. Layout:
 *
 *   "OCEMB1" (6 bytes magic) || dimensions:u32-le (4 bytes)
 *   per record:
 *     uuid-bytes (16) || embedding (dimensions × float32-le)
 *
 * Float32 instead of float64 — pgvector itself stores float32, so no precision
 * is lost. Cuts the embedding payload by ~3× vs JSON-of-floats.
 */
const EMBED_MAGIC = "OCEMB1";

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) throw new Error(`bad uuid: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encodeEmbeddings(
  rows: Array<{ id: string; embedding: number[] | null }>,
  dimensions: number,
): Uint8Array {
  const withEmbeddings = rows.filter((r) => r.embedding !== null);
  const recordBytes = 16 + dimensions * 4;
  const headerBytes = EMBED_MAGIC.length + 4;
  const out = new Uint8Array(headerBytes + withEmbeddings.length * recordBytes);

  // Magic + dimensions
  for (let i = 0; i < EMBED_MAGIC.length; i++) {
    out[i] = EMBED_MAGIC.charCodeAt(i);
  }
  const dv = new DataView(out.buffer);
  dv.setUint32(EMBED_MAGIC.length, dimensions, true);

  let offset = headerBytes;
  for (const row of withEmbeddings) {
    out.set(uuidToBytes(row.id), offset);
    offset += 16;
    for (let i = 0; i < dimensions; i++) {
      dv.setFloat32(offset, row.embedding![i], true);
      offset += 4;
    }
  }
  return out;
}

function toJsonl(rows: unknown[]): Uint8Array {
  if (rows.length === 0) return new Uint8Array(0);
  return strToU8(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, 32, "sha256");
}

function encryptZip(zip: Uint8Array, passphrase: string): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(zip), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = JSON.stringify({
    format: FORMAT_ID,
    encrypted: true,
    kdf: KDF,
    iterations: KDF_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
  });
  return Buffer.concat([
    Buffer.from(header + "\n", "utf-8"),
    ct,
    tag,
  ]);
}

export interface ExportOptions {
  includeEmbeddings: boolean;
  passphrase?: string | null;
  exporterEmail: string | null;
  appVersion?: string;
}

export async function exportWorkspace(
  db: Db,
  workspaceId: string,
  opts: ExportOptions,
): Promise<{ filename: string; bytes: Buffer; manifest: Manifest }> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) throw new Error("workspace not found");

  // Pull all workspace-scoped tables in parallel.
  const [
    voicesRows,
    voiceSamplesRows,
    voiceAuditsRows,
    modelDefaultsRows,
    kbSourcesRows,
    kbChunksRowsRaw,
    documentsRows,
    agentRunsRows,
    copyVariantsRows,
    chatThreadsRows,
    chatMessagesRows,
    campaignsRows,
    campaignAssetsRows,
    membershipRows,
  ] = await Promise.all([
    db.select().from(brandVoices).where(eq(brandVoices.workspaceId, workspaceId)),
    db.select().from(voiceSamples).where(eq(voiceSamples.workspaceId, workspaceId)),
    db.select().from(voiceAudits).where(eq(voiceAudits.workspaceId, workspaceId)),
    db.select().from(modelDefaults).where(eq(modelDefaults.workspaceId, workspaceId)),
    db.select().from(kbSources).where(eq(kbSources.workspaceId, workspaceId)),
    db.select().from(kbChunks).where(eq(kbChunks.workspaceId, workspaceId)),
    db.select().from(documents).where(eq(documents.workspaceId, workspaceId)),
    db.select().from(agentRuns).where(eq(agentRuns.workspaceId, workspaceId)),
    db.select().from(copyVariants).where(eq(copyVariants.workspaceId, workspaceId)),
    db.select().from(chatThreads).where(eq(chatThreads.workspaceId, workspaceId)),
    db.select().from(chatMessages).where(eq(chatMessages.workspaceId, workspaceId)),
    db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId)),
    db.select().from(campaignAssets).where(eq(campaignAssets.workspaceId, workspaceId)),
    db
      .select({
        userId: members.userId,
        role: members.role,
        email: users.email,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.workspaceId, workspaceId)),
  ]);

  // agent_run_step has no workspaceId; scope by run.id.
  const agentRunIds = agentRunsRows.map((r) => r.id);
  const agentRunStepsRows =
    agentRunIds.length > 0
      ? await db
          .select()
          .from(agentRunSteps)
          .where(inArray(agentRunSteps.runId, agentRunIds))
      : [];

  // Embeddings: dimensions match the chunk's source's embeddingDimensions.
  // We require all chunks-with-embeddings to share dimensions (they do today;
  // a workspace pins its embedding model in modelDefaults). Surface in manifest.
  const embeddingDimensions =
    kbChunksRowsRaw.find((c) => c.embedding !== null)?.embedding?.length ?? null;
  const embeddingsModel =
    kbSourcesRows.find((s) => s.embeddingModel !== null)?.embeddingModel ?? null;

  const includeEmbeddings =
    opts.includeEmbeddings && embeddingDimensions !== null;

  // Strip embedding column from JSONL when we ship it as a binary blob;
  // also strip it entirely when includeEmbeddings is false.
  const kbChunksForJsonl = kbChunksRowsRaw.map((row) => {
    const { embedding: _embedding, ...rest } = row;
    return rest;
  });

  const tables: Record<string, unknown[]> = {
    workspace: [workspace],
    brand_voice: voicesRows,
    voice_sample: voiceSamplesRows,
    voice_audit: voiceAuditsRows,
    model_default: modelDefaultsRows,
    kb_source: kbSourcesRows,
    kb_chunk: kbChunksForJsonl,
    document: documentsRows,
    agent_run: agentRunsRows,
    agent_run_step: agentRunStepsRows,
    copy_variant: copyVariantsRows,
    chat_thread: chatThreadsRows,
    chat_message: chatMessagesRows,
    campaign: campaignsRows,
    campaign_asset: campaignAssetsRows,
  };

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    format: FORMAT_ID,
    exportedAt: new Date().toISOString(),
    exporter: { email: opts.exporterEmail },
    source: {
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        defaultLocale: workspace.defaultLocale,
      },
      appVersion: opts.appVersion,
    },
    tables: Object.entries(tables).map(([name, rows]) => ({
      name: name as Manifest["tables"][number]["name"],
      rowCount: rows.length,
    })),
    memberLabels: membershipRows.map((m) => ({
      email: m.email,
      role: m.role,
    })),
    includesEmbeddings: includeEmbeddings,
    embeddingsModel: includeEmbeddings ? embeddingsModel : null,
    embeddingDimensions: includeEmbeddings ? embeddingDimensions : null,
    notIncluded: [...NOT_INCLUDED],
  };

  // Build zip entries.
  const zipFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
    "README.txt": strToU8(buildReadme(manifest)),
  };
  for (const [name, rows] of Object.entries(tables)) {
    zipFiles[`tables/${name}.jsonl`] = toJsonl(rows);
  }
  if (includeEmbeddings && embeddingDimensions !== null) {
    zipFiles["embeddings/chunks.bin"] = encodeEmbeddings(
      kbChunksRowsRaw.map((c) => ({ id: c.id, embedding: c.embedding })),
      embeddingDimensions,
    );
  }

  const zipBytes = zipSync(zipFiles, { level: 6 });

  let payload: Buffer;
  if (opts.passphrase) {
    payload = encryptZip(zipBytes, opts.passphrase);
  } else {
    payload = Buffer.from(zipBytes);
  }

  const safeSlug = workspace.slug.replace(/[^a-zA-Z0-9_-]/g, "_") || "workspace";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${safeSlug}-${stamp}.opencopy`;

  return { filename, bytes: payload, manifest };
}

function buildReadme(m: Manifest): string {
  const lines: string[] = [];
  lines.push(`OpenCopy workspace export (${m.format})`);
  lines.push(``);
  lines.push(`Workspace:    ${m.source.workspace.name}`);
  lines.push(`Slug:         ${m.source.workspace.slug}`);
  lines.push(`Locale:       ${m.source.workspace.defaultLocale}`);
  lines.push(`Exported at:  ${m.exportedAt}`);
  if (m.exporter.email) {
    lines.push(`Exported by:  ${m.exporter.email}`);
  }
  lines.push(``);
  lines.push(`Tables:`);
  for (const t of m.tables) {
    lines.push(`  ${t.name.padEnd(20)} ${t.rowCount} row${t.rowCount === 1 ? "" : "s"}`);
  }
  lines.push(``);
  lines.push(
    `Embeddings:   ${m.includesEmbeddings ? `included (${m.embeddingsModel ?? "?"} · ${m.embeddingDimensions ?? "?"} dims)` : "not included — importer can recompute on demand"}`,
  );
  lines.push(``);
  lines.push(`Member labels (re-invite hints):`);
  if (m.memberLabels.length === 0) {
    lines.push(`  (none)`);
  } else {
    for (const member of m.memberLabels) {
      lines.push(`  ${member.email} (${member.role})`);
    }
  }
  lines.push(``);
  lines.push(
    `Not included: ${m.notIncluded.join(", ")}.`,
  );
  lines.push(
    `The importer becomes the sole owner of the new workspace; re-invite teammates from above.`,
  );
  return lines.join("\n") + "\n";
}
