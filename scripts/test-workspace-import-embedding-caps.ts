// Regression test for the "manifest can claim arbitrary embedding dim /
// any row count" bug.
//
// Before the fix, the importer's only dim check was `blob.dim ===
// manifest.embeddingDimensions` — the manifest controlled both sides, so a
// malicious .opencopy could declare `embeddingDimensions: 8` and ship 8-dim
// vectors, then try to insert those into a column hard-typed at 1536. Best
// case: a noisy SQL error after some inserts. Worst case: a million tiny
// rows quietly explode the kb_chunk table.
//
// The fix:
//   - Hard-validate dim against the schema constant KB_EMBEDDING_DIMENSIONS
//     (1536). Mismatch → ImportError(BAD_FORMAT).
//   - Cap kb_chunk row count at 1,000,000 (and apply the same cap to every
//     manifest-declared table row count). Over → ImportError(BAD_MANIFEST).
//
// This test constructs three malicious manifests in-process and confirms
// each is rejected at parseOpenCopy() time, before any DB transaction
// is touched.
//
//   pnpm tsx scripts/test-workspace-import-embedding-caps.ts
//
// HIGH — embedding-row spam (v2.5.0).

import { zipSync, strToU8 } from "fflate";

import {
  ImportError,
  parseOpenCopy,
} from "../src/lib/export/workspace-import";
import { KB_EMBEDDING_DIMENSIONS } from "../src/db/schema";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const FORMAT_ID = "opencopy/v1";
const SCHEMA_VERSION = 1;

const EXPORT_TABLES = [
  "workspace",
  "brand_voice",
  "voice_sample",
  "voice_audit",
  "model_default",
  "kb_source",
  "kb_chunk",
  "document",
  "agent_run",
  "agent_run_step",
  "copy_variant",
  "chat_thread",
  "chat_message",
  "campaign",
  "campaign_asset",
];

function buildManifest(overrides: {
  embeddingDimensions?: number | null;
  includesEmbeddings?: boolean;
  kbChunkRowCount?: number;
}): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    format: FORMAT_ID,
    exportedAt: new Date().toISOString(),
    exporter: { email: "x@y.com" },
    source: {
      workspace: { name: "Test", slug: "test", defaultLocale: "en" },
      appVersion: "test",
    },
    tables: EXPORT_TABLES.map((name) => ({
      name,
      rowCount: name === "kb_chunk" ? (overrides.kbChunkRowCount ?? 0) : 0,
    })),
    memberLabels: [],
    includesEmbeddings: overrides.includesEmbeddings ?? false,
    embeddingsModel: null,
    embeddingDimensions: overrides.embeddingDimensions ?? null,
    notIncluded: [],
  };
}

function buildZip(manifest: Record<string, unknown>, extra: Record<string, Uint8Array> = {}): Buffer {
  const payload: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest)),
    ...extra,
  };
  // Empty jsonl for every required table to satisfy readJsonl
  for (const t of EXPORT_TABLES) {
    if (!payload[`tables/${t}.jsonl`]) {
      payload[`tables/${t}.jsonl`] = strToU8("");
    }
  }
  return Buffer.from(zipSync(payload));
}

function expectImportError(
  label: string,
  bytes: Buffer,
  wantCode: string,
): void {
  let threw = false;
  let code: string | undefined;
  let msg = "";
  try {
    parseOpenCopy(bytes);
  } catch (err) {
    if (err instanceof ImportError) {
      threw = true;
      code = err.code;
      msg = err.message;
    } else {
      fail(`${label}: unexpected error type: ${(err as Error).message}`);
    }
  }
  if (!threw) fail(`${label}: expected ImportError`);
  if (code !== wantCode) fail(`${label}: got code=${code}, want ${wantCode}; msg=${msg}`);
  console.log(`✓ ${label} → code=${code}`);
}

// ---- 1. wrong dim in manifest (declares 8, not 1536) --------------------
console.log("→ manifest declares embeddingDimensions: 8 (not 1536)");
{
  const m = buildManifest({
    includesEmbeddings: true,
    embeddingDimensions: 8,
  });
  // Pack a dim-8 embedding blob to be thorough. Magic "OCEMB1" + u32-le 8.
  const blob = new Uint8Array(10);
  blob.set([0x4f, 0x43, 0x45, 0x4d, 0x42, 0x31], 0); // "OCEMB1"
  new DataView(blob.buffer).setUint32(6, 8, true);
  const zip = buildZip(m, { "embeddings/chunks.bin": blob });
  expectImportError("wrong-dim-8", zip, "BAD_FORMAT");
}

// ---- 2. wrong dim in manifest (declares 1024, not 1536) -----------------
console.log("\n→ manifest declares embeddingDimensions: 1024 (not 1536)");
{
  const m = buildManifest({
    includesEmbeddings: true,
    embeddingDimensions: 1024,
  });
  const zip = buildZip(m);
  expectImportError("wrong-dim-1024", zip, "BAD_FORMAT");
}

// ---- 3. manifest declares kb_chunk rowCount > 1,000,000 -----------------
console.log("\n→ manifest declares kb_chunk rowCount: 1_500_000");
{
  const m = buildManifest({ kbChunkRowCount: 1_500_000 });
  const zip = buildZip(m);
  expectImportError("too-many-chunks", zip, "BAD_MANIFEST");
}

// ---- 4. happy path: well-formed manifest with includesEmbeddings: false
//    parses fine.
console.log("\n→ happy-path manifest (no embeddings)");
{
  const m = buildManifest({ includesEmbeddings: false });
  const zip = buildZip(m);
  try {
    const parsed = parseOpenCopy(zip);
    if (parsed.manifest.embeddingDimensions !== null) {
      fail("happy-path manifest: unexpected embeddingDimensions");
    }
    console.log("✓ parsed cleanly");
  } catch (err) {
    fail(`happy-path manifest unexpectedly rejected: ${(err as Error).message}`);
  }
}

// ---- 5. happy path: manifest with correct dim (1536) parses fine.
console.log("\n→ happy-path manifest (embeddingDimensions = 1536)");
{
  const m = buildManifest({
    includesEmbeddings: true,
    embeddingDimensions: KB_EMBEDDING_DIMENSIONS,
  });
  // Empty blob is fine — magic + dim header only.
  const blob = new Uint8Array(10);
  blob.set([0x4f, 0x43, 0x45, 0x4d, 0x42, 0x31], 0);
  new DataView(blob.buffer).setUint32(6, KB_EMBEDDING_DIMENSIONS, true);
  const zip = buildZip(m, { "embeddings/chunks.bin": blob });
  try {
    const parsed = parseOpenCopy(zip);
    if (parsed.manifest.embeddingDimensions !== KB_EMBEDDING_DIMENSIONS) {
      fail("dim should be the schema constant");
    }
    console.log("✓ parsed cleanly");
  } catch (err) {
    fail(`1536-dim manifest unexpectedly rejected: ${(err as Error).message}`);
  }
}

console.log("\n✓ embedding-dim and row-count caps enforced at parseOpenCopy time");
