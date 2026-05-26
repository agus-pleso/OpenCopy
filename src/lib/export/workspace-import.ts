import { createDecipheriv, pbkdf2Sync, randomUUID } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
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
  userPrefs,
  voiceAudits,
  voiceSamples,
  workspaces,
} from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;

import {
  fileHeaderSchema,
  manifestSchema,
  IV_BYTES,
  SCHEMA_VERSION,
  type Manifest,
} from "./workspace-format";

const TAG_BYTES = 16; // GCM auth tag length

// Caps for untrusted .opencopy archives. Without these, parseOpenCopy() can
// be fed a zip-bomb (thousands of compressible entries, or one multi-GB
// entry) and exhaust server memory before any validation runs.
const MAX_ZIP_ENTRIES = 1000;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024; // 100 MB

export class ImportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "ENCRYPTED"
      | "BAD_PASSPHRASE"
      | "BAD_FORMAT"
      | "BAD_SCHEMA_VERSION"
      | "BAD_MANIFEST"
      | "MISSING_TABLE"
      | "DIM_MISMATCH",
  ) {
    super(message);
  }
}

export interface ParsedExport {
  manifest: Manifest;
  files: Record<string, Uint8Array>;
}

/**
 * Decode an .opencopy file. Detects encryption by the first byte:
 *   - 'P' (0x50): bare zip → just unzip + parse manifest
 *   - '{' (0x7B): encrypted wrapper → JSON header + ciphertext+tag, decrypt, unzip
 */
export function parseOpenCopy(
  bytes: Buffer,
  passphrase?: string,
): ParsedExport {
  if (bytes.length < 4) {
    throw new ImportError("file too short to be an .opencopy", "BAD_FORMAT");
  }

  let zipBytes: Uint8Array;
  if (bytes[0] === 0x50) {
    // Plain zip
    zipBytes = bytes;
  } else if (bytes[0] === 0x7b) {
    // Encrypted wrapper
    if (!passphrase) {
      throw new ImportError(
        "this file is encrypted; provide a passphrase",
        "ENCRYPTED",
      );
    }
    const newlineIdx = bytes.indexOf(0x0a);
    if (newlineIdx < 0) {
      throw new ImportError("malformed encrypted header", "BAD_FORMAT");
    }
    const headerJson = bytes.subarray(0, newlineIdx).toString("utf-8");
    let header: ReturnType<typeof fileHeaderSchema.parse>;
    try {
      header = fileHeaderSchema.parse(JSON.parse(headerJson));
    } catch {
      throw new ImportError("invalid encryption header", "BAD_FORMAT");
    }

    const body = bytes.subarray(newlineIdx + 1);
    if (body.length < TAG_BYTES + 1) {
      throw new ImportError("encrypted body too short", "BAD_FORMAT");
    }
    const ciphertext = body.subarray(0, body.length - TAG_BYTES);
    const tag = body.subarray(body.length - TAG_BYTES);

    const salt = Buffer.from(header.salt, "base64");
    const iv = Buffer.from(header.iv, "base64");
    if (iv.length !== IV_BYTES) {
      throw new ImportError("bad iv length in header", "BAD_FORMAT");
    }
    const key = pbkdf2Sync(passphrase, salt, header.iterations, 32, "sha256");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    try {
      zipBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new ImportError("wrong passphrase or corrupted file", "BAD_PASSPHRASE");
    }
  } else {
    throw new ImportError(
      `unrecognised file (first byte 0x${bytes[0].toString(16)})`,
      "BAD_FORMAT",
    );
  }

  // Cap zip unpacking: at most MAX_ZIP_ENTRIES entries, and each entry's
  // decompressed size must be ≤ MAX_ENTRY_BYTES. Without these caps a
  // malicious .opencopy file can pack thousands of highly-compressible
  // entries or one multi-GB entry and exhaust server memory before any
  // validation runs. fflate's `filter` runs once per entry BEFORE
  // decompression, so we can reject early.
  let files: Record<string, Uint8Array>;
  let entryCount = 0;
  try {
    files = unzipSync(zipBytes, {
      filter: (entry) => {
        if (++entryCount > MAX_ZIP_ENTRIES) {
          throw new ImportError(
            `zip has more than ${MAX_ZIP_ENTRIES} entries`,
            "BAD_FORMAT",
          );
        }
        if (entry.originalSize > MAX_ENTRY_BYTES) {
          throw new ImportError(
            `entry "${entry.name}" decompressed size ${entry.originalSize} exceeds cap ${MAX_ENTRY_BYTES}`,
            "BAD_FORMAT",
          );
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("zip is malformed", "BAD_FORMAT");
  }

  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) {
    throw new ImportError("manifest.json missing", "BAD_MANIFEST");
  }

  let manifest: Manifest;
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  } catch (err) {
    throw new ImportError(
      `invalid manifest: ${(err as Error).message}`,
      "BAD_MANIFEST",
    );
  }

  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new ImportError(
      `unsupported schemaVersion ${manifest.schemaVersion} (this build expects ${SCHEMA_VERSION})`,
      "BAD_SCHEMA_VERSION",
    );
  }

  return { manifest, files };
}

function readJsonl<T = Record<string, unknown>>(
  files: Record<string, Uint8Array>,
  table: string,
): T[] {
  const buf = files[`tables/${table}.jsonl`];
  if (!buf) throw new ImportError(`missing tables/${table}.jsonl`, "MISSING_TABLE");
  const text = strFromU8(buf).trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line) as T);
}

function bytesToUuid(b: Uint8Array): string {
  const hex = Array.from(b)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function decodeEmbeddings(
  bytes: Uint8Array | undefined,
  expectedDim: number | null,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (!bytes || bytes.length === 0 || expectedDim === null) return out;
  const magic = strFromU8(bytes.subarray(0, 6));
  if (magic !== "OCEMB1") {
    throw new ImportError("embedding blob has wrong magic", "BAD_FORMAT");
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dim = dv.getUint32(6, true);
  if (dim !== expectedDim) {
    throw new ImportError(
      `embedding dimension mismatch (blob=${dim}, manifest=${expectedDim})`,
      "DIM_MISMATCH",
    );
  }
  const recordBytes = 16 + dim * 4;
  let offset = 10;
  while (offset + recordBytes <= bytes.length) {
    const id = bytesToUuid(bytes.subarray(offset, offset + 16));
    const emb = new Array<number>(dim);
    for (let i = 0; i < dim; i++) {
      emb[i] = dv.getFloat32(offset + 16 + i * 4, true);
    }
    out.set(id, emb);
    offset += recordBytes;
  }
  return out;
}

const DATE_KEY_RX = /(?:^|_|[a-z])(?:At|_at)$/;

/** Walk a row, convert ISO-8601 timestamp strings on `*At` / `*_at` keys back
 *  to Date objects. drizzle's `mode: "date"` columns reject string inputs. */
function reviveDates<T extends Record<string, unknown>>(row: T): T {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (
      typeof v === "string" &&
      DATE_KEY_RX.test(k) &&
      /^\d{4}-\d{2}-\d{2}T/.test(v)
    ) {
      (row as Record<string, unknown>)[k] = new Date(v);
    }
  }
  return row;
}

export interface ImportResult {
  workspaceId: string;
}

/**
 * Insert a parsed export into the running database. The importer becomes the
 * sole owner of the new workspace. All UUIDs are rewritten so the imported
 * data never collides with an existing workspace. Runs in a single transaction
 * — if any insert fails the whole import is rolled back.
 */
export async function importWorkspace(
  db: Db,
  parsed: ParsedExport,
  importerUserId: string,
): Promise<ImportResult> {
  const { manifest, files } = parsed;

  // Pre-parse all the table dumps so we fail fast before opening a tx.
  const wsRows = readJsonl<Record<string, unknown>>(files, "workspace");
  if (wsRows.length !== 1) {
    throw new ImportError(
      `expected exactly 1 workspace row, got ${wsRows.length}`,
      "BAD_MANIFEST",
    );
  }
  const sourceWorkspace = reviveDates(wsRows[0]);

  const voicesRows = readJsonl(files, "brand_voice").map(reviveDates);
  const voiceSamplesRows = readJsonl(files, "voice_sample").map(reviveDates);
  const voiceAuditsRows = readJsonl(files, "voice_audit").map(reviveDates);
  const modelDefaultsRows = readJsonl(files, "model_default").map(reviveDates);
  const kbSourcesRows = readJsonl(files, "kb_source").map(reviveDates);
  const kbChunksRows = readJsonl(files, "kb_chunk").map(reviveDates);
  const documentsRows = readJsonl(files, "document").map(reviveDates);
  const agentRunsRows = readJsonl(files, "agent_run").map(reviveDates);
  const agentRunStepsRows = readJsonl(files, "agent_run_step").map(reviveDates);
  const copyVariantsRows = readJsonl(files, "copy_variant").map(reviveDates);
  const chatThreadsRows = readJsonl(files, "chat_thread").map(reviveDates);
  const chatMessagesRows = readJsonl(files, "chat_message").map(reviveDates);
  const campaignsRows = readJsonl(files, "campaign").map(reviveDates);
  const campaignAssetsRows = readJsonl(files, "campaign_asset").map(reviveDates);

  const embeddingMap = manifest.includesEmbeddings
    ? decodeEmbeddings(files["embeddings/chunks.bin"], manifest.embeddingDimensions)
    : new Map<string, number[]>();

  // Allocate fresh IDs for every entity. We keep the original IDs as map keys
  // and rewrite all FK fields below.
  const newWorkspaceId = randomUUID();
  const remap = new Map<string, string>();
  const remapAll = (rows: Array<{ id: string }>) => {
    for (const r of rows) remap.set(r.id, randomUUID());
  };
  remap.set(sourceWorkspace.id as string, newWorkspaceId);
  remapAll(voicesRows as Array<{ id: string }>);
  remapAll(voiceSamplesRows as Array<{ id: string }>);
  remapAll(voiceAuditsRows as Array<{ id: string }>);
  remapAll(modelDefaultsRows as Array<{ id: string }>);
  remapAll(kbSourcesRows as Array<{ id: string }>);
  remapAll(kbChunksRows as Array<{ id: string }>);
  remapAll(documentsRows as Array<{ id: string }>);
  remapAll(agentRunsRows as Array<{ id: string }>);
  remapAll(agentRunStepsRows as Array<{ id: string }>);
  remapAll(copyVariantsRows as Array<{ id: string }>);
  remapAll(chatThreadsRows as Array<{ id: string }>);
  remapAll(chatMessagesRows as Array<{ id: string }>);
  remapAll(campaignsRows as Array<{ id: string }>);
  remapAll(campaignAssetsRows as Array<{ id: string }>);

  // Helper: rewrite the columns we care about. Anything that points at the
  // exporter's user.id (which doesn't exist here) gets pinned to the importer.
  type Row = Record<string, unknown>;
  const rewrite = (
    row: Row,
    fkColumns: string[],
    userColumns: string[] = [],
  ): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      if (fkColumns.includes(k) && typeof v === "string") {
        out[k] = remap.get(v) ?? v;
      } else if (userColumns.includes(k)) {
        out[k] = importerUserId;
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  await db.transaction(async (tx) => {
    // 1. workspace
    await tx.insert(workspaces).values({
      ...(sourceWorkspace as typeof workspaces.$inferInsert),
      id: newWorkspaceId,
      createdByUserId: importerUserId,
      // Slug uniqueness — append a short suffix to avoid collisions.
      slug: `${(sourceWorkspace.slug as string) || "workspace"}-${newWorkspaceId.slice(0, 4)}`,
    });

    // 2. members — importer is owner
    await tx.insert(members).values({
      workspaceId: newWorkspaceId,
      userId: importerUserId,
      role: "owner",
    });

    // 3. point importer's currentWorkspaceId at the new one
    await tx
      .insert(userPrefs)
      .values({ userId: importerUserId, currentWorkspaceId: newWorkspaceId })
      .onConflictDoUpdate({
        target: userPrefs.userId,
        set: { currentWorkspaceId: newWorkspaceId, updatedAt: new Date() },
      });

    // 4. brand voices
    if (voicesRows.length > 0) {
      await tx.insert(brandVoices).values(
        voicesRows.map((r) =>
          rewrite(r, ["id", "workspaceId"], ["createdByUserId"]),
        ) as (typeof brandVoices.$inferInsert)[],
      );
    }

    // 5. voice samples
    if (voiceSamplesRows.length > 0) {
      await tx.insert(voiceSamples).values(
        voiceSamplesRows.map((r) =>
          rewrite(r, ["id", "voiceId", "workspaceId"]),
        ) as (typeof voiceSamples.$inferInsert)[],
      );
    }

    // 6. voice audits
    if (voiceAuditsRows.length > 0) {
      await tx.insert(voiceAudits).values(
        voiceAuditsRows.map((r) =>
          rewrite(r, ["id", "voiceId", "workspaceId"], ["createdByUserId"]),
        ) as (typeof voiceAudits.$inferInsert)[],
      );
    }

    // 7. model defaults
    if (modelDefaultsRows.length > 0) {
      await tx.insert(modelDefaults).values(
        modelDefaultsRows.map((r) =>
          rewrite(r, ["id", "workspaceId"]),
        ) as (typeof modelDefaults.$inferInsert)[],
      );
    }

    // 8. kb sources
    if (kbSourcesRows.length > 0) {
      await tx.insert(kbSources).values(
        kbSourcesRows.map((r) =>
          rewrite(r, ["id", "workspaceId"], ["createdByUserId"]),
        ) as (typeof kbSources.$inferInsert)[],
      );
    }

    // 9. kb chunks (re-attach embeddings if we have them)
    if (kbChunksRows.length > 0) {
      const enriched = kbChunksRows.map((r) => {
        const remapped = rewrite(r, ["id", "sourceId", "workspaceId"]);
        const oldId = r.id as string;
        const emb = embeddingMap.get(oldId);
        if (emb) remapped.embedding = emb;
        return remapped;
      });
      await tx
        .insert(kbChunks)
        .values(enriched as (typeof kbChunks.$inferInsert)[]);
    }

    // 10. documents
    if (documentsRows.length > 0) {
      await tx.insert(documents).values(
        documentsRows.map((r) =>
          rewrite(r, ["id", "workspaceId"], ["createdByUserId"]),
        ) as (typeof documents.$inferInsert)[],
      );
    }

    // 11. agent runs
    if (agentRunsRows.length > 0) {
      await tx.insert(agentRuns).values(
        agentRunsRows.map((r) =>
          rewrite(
            r,
            ["id", "workspaceId", "voiceId", "documentId"],
            ["createdByUserId"],
          ),
        ) as (typeof agentRuns.$inferInsert)[],
      );
    }

    // 12. agent run steps
    if (agentRunStepsRows.length > 0) {
      await tx.insert(agentRunSteps).values(
        agentRunStepsRows.map((r) =>
          rewrite(r, ["id", "runId"]),
        ) as (typeof agentRunSteps.$inferInsert)[],
      );
    }

    // 13. copy variants
    if (copyVariantsRows.length > 0) {
      await tx.insert(copyVariants).values(
        copyVariantsRows.map((r) =>
          rewrite(r, ["id", "runId", "workspaceId", "voiceId"]),
        ) as (typeof copyVariants.$inferInsert)[],
      );
    }

    // 14. chat threads
    if (chatThreadsRows.length > 0) {
      await tx.insert(chatThreads).values(
        chatThreadsRows.map((r) =>
          rewrite(
            r,
            ["id", "workspaceId", "voiceId"],
            ["createdByUserId"],
          ),
        ) as (typeof chatThreads.$inferInsert)[],
      );
    }

    // 15. chat messages
    if (chatMessagesRows.length > 0) {
      await tx.insert(chatMessages).values(
        chatMessagesRows.map((r) =>
          rewrite(r, ["id", "threadId", "workspaceId"]),
        ) as (typeof chatMessages.$inferInsert)[],
      );
    }

    // 16. campaigns
    if (campaignsRows.length > 0) {
      await tx.insert(campaigns).values(
        campaignsRows.map((r) =>
          rewrite(
            r,
            ["id", "workspaceId", "voiceId"],
            ["createdByUserId"],
          ),
        ) as (typeof campaigns.$inferInsert)[],
      );
    }

    // 17. campaign assets
    if (campaignAssetsRows.length > 0) {
      await tx.insert(campaignAssets).values(
        campaignAssetsRows.map((r) =>
          rewrite(r, ["id", "campaignId", "workspaceId", "runId"]),
        ) as (typeof campaignAssets.$inferInsert)[],
      );
    }
  });

  return { workspaceId: newWorkspaceId };
}
