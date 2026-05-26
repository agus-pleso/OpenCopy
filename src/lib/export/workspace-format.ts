// .opencopy file-format spec for workspace export/import.
// Shared by both the server-side exporter/importer and any UI that needs
// to introspect an .opencopy file (e.g. the import preview dialog).
//
// Wire format:
//   - Unencrypted: a standard zip file. First 2 bytes are the zip magic
//     "PK" (0x50 0x4B). Any unzip tool can open it.
//   - Encrypted:   a small JSON header line followed by AES-256-GCM
//     ciphertext of what would otherwise be the zip body. First byte is
//     '{' (0x7B). Distinguishable from a zip by the first byte.
//
// Zip / decrypted-payload contents:
//   manifest.json      — schemaVersion + workspace metadata + table inventory
//   tables/<name>.jsonl — one JSON object per row, newline-separated
//   embeddings/chunks.bin — pgvector embeddings (only when includeEmbeddings)
//   README.txt         — human-readable summary so the file is self-explaining
//
// Crypto: PBKDF2-SHA-256 (300k iterations) over UTF-8 passphrase + 16-byte
// random salt → 256-bit AES key. AES-256-GCM with 12-byte random IV. The
// encrypted blob is `cipher.update(zip) || cipher.final() || authTag`. The
// outer JSON header carries `salt`, `iv`, `iterations`, `kdf`. The inner
// zip is otherwise identical to the unencrypted form.

import { z } from "zod";

export const FORMAT_ID = "opencopy/v1";
export const SCHEMA_VERSION = 1;
export const KDF = "pbkdf2-sha256";
export const KDF_ITERATIONS = 300_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

/**
 * Tables shipped inside `tables/<name>.jsonl`. Order matters for import —
 * later tables can reference earlier ones via FK columns. The importer
 * walks this list in order and rewrites FKs as it goes.
 */
export const EXPORT_TABLES = [
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
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Tables we deliberately exclude from the export for security or correctness. */
export const NOT_INCLUDED = [
  "api_key",        // re-enter on import
  "member",         // exporter becomes sole owner of the imported workspace
  "workspace_invitation", // transient, importer re-invites
  "user",           // auth state is per-install
  "session",
  "account",
  "credentials",
  "verificationToken",
  "user_prefs",
] as const;

export const fileHeaderSchema = z.object({
  format: z.literal(FORMAT_ID),
  encrypted: z.literal(true),
  kdf: z.literal(KDF),
  iterations: z.number().int().positive(),
  salt: z.string(), // base64
  iv: z.string(),   // base64
});

export type FileHeader = z.infer<typeof fileHeaderSchema>;

export const manifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  format: z.literal(FORMAT_ID),
  exportedAt: z.string(), // ISO timestamp
  exporter: z.object({
    /** Email of the user who exported, kept as a label for re-invitation hints. */
    email: z.string().nullable(),
  }),
  source: z.object({
    workspace: z.object({
      name: z.string(),
      slug: z.string(),
      defaultLocale: z.string(),
    }),
    appVersion: z.string().optional(),
  }),
  tables: z.array(
    z.object({
      name: z.enum(EXPORT_TABLES),
      rowCount: z.number().int().nonnegative(),
    }),
  ),
  /** Member rows are not exported; we surface their emails as labels so the
   *  importer can re-invite the same teammates with one click. */
  memberLabels: z.array(
    z.object({
      email: z.string(),
      role: z.enum(["owner", "admin", "editor", "viewer"]),
    }),
  ),
  includesEmbeddings: z.boolean(),
  embeddingsModel: z.string().nullable(),
  embeddingDimensions: z.number().int().positive().nullable(),
  notIncluded: z.array(z.string()),
});

export type Manifest = z.infer<typeof manifestSchema>;
