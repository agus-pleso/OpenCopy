// End-to-end smoke test for workspace export/import.
//
// Spins up two ephemeral PGlite stores in-process — neither uses the project's
// `client.ts` — and exports from one into the other. Validates UUID remap,
// encryption, embedding round-trip, and ownership transfer.
//
//   pnpm tsx scripts/test-workspace-roundtrip.ts

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { sql, eq } from "drizzle-orm";

import * as schema from "../src/db/schema";
import { exportWorkspace } from "../src/lib/export/workspace-export";
import {
  ImportError,
  importWorkspace,
  parseOpenCopy,
} from "../src/lib/export/workspace-import";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function setupDb() {
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-rt-"));
  const client = new PGlite(dataDir, { extensions: { vector } });
  await client.waitReady;
  await client.exec("CREATE EXTENSION IF NOT EXISTS vector");

  const files = readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const text = readFileSync(join("drizzle", file), "utf-8");
    for (const stmt of text
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = drizzle(client, { schema }) as any;
  return { db, client, dataDir };
}

async function main() {
  console.log("→ setting up source DB");
  const src = await setupDb();

  const userId = randomUUID();
  const wsId = randomUUID();
  const voiceId = randomUUID();
  const sourceId = randomUUID();
  const chunkIds = [randomUUID(), randomUUID(), randomUUID()];
  const dim = 1536;
  const mkEmbed = () =>
    Array.from({ length: dim }, () => Math.random() * 2 - 1);
  const emb1 = mkEmbed();
  const emb2 = mkEmbed();

  await src.db.insert(schema.users).values({
    id: userId,
    email: "alice@example.com",
    name: "Alice",
    emailVerified: new Date(),
  });
  await src.db.insert(schema.workspaces).values({
    id: wsId,
    name: "Acme Marketing",
    slug: "acme-marketing",
    defaultLocale: "en",
    createdByUserId: userId,
  });
  await src.db.insert(schema.members).values({
    workspaceId: wsId,
    userId,
    role: "owner",
  });
  await src.db.insert(schema.brandVoices).values({
    id: voiceId,
    workspaceId: wsId,
    name: "House voice",
    status: "active",
    createdByUserId: userId,
  });
  await src.db.insert(schema.kbSources).values({
    id: sourceId,
    workspaceId: wsId,
    name: "Brand handbook",
    status: "ready",
    rawContent: "lorem ipsum dolor sit amet",
    createdByUserId: userId,
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
  });
  await src.db.insert(schema.kbChunks).values([
    {
      id: chunkIds[0],
      sourceId,
      workspaceId: wsId,
      seq: 0,
      content: "First chunk",
      embedding: emb1,
    },
    {
      id: chunkIds[1],
      sourceId,
      workspaceId: wsId,
      seq: 1,
      content: "Second chunk",
      embedding: emb2,
    },
    {
      id: chunkIds[2],
      sourceId,
      workspaceId: wsId,
      seq: 2,
      content: "Third chunk (no embedding)",
      embedding: null,
    },
  ]);
  console.log("✓ seeded source workspace");

  console.log("→ exporting source workspace");
  const exported = await exportWorkspace(src.db, wsId, {
    includeEmbeddings: true,
    passphrase: "correcthorsebatterystaple",
    exporterEmail: "alice@example.com",
  });
  console.log(`✓ ${exported.filename} (${exported.bytes.length} bytes)`);
  if (exported.bytes[0] !== 0x7b) fail("encrypted file should start with '{'");

  console.log("→ tearing down source");
  await src.client.close();
  rmSync(src.dataDir, { recursive: true, force: true });

  console.log("→ setting up destination DB");
  const dest = await setupDb();

  const importerId = randomUUID();
  await dest.db.insert(schema.users).values({
    id: importerId,
    email: "bob@example.com",
    name: "Bob",
    emailVerified: new Date(),
  });

  console.log("→ negative paths");
  let threw = false;
  try {
    parseOpenCopy(exported.bytes);
  } catch (err) {
    threw = err instanceof ImportError && err.code === "ENCRYPTED";
  }
  if (!threw) fail("expected ENCRYPTED error without passphrase");
  console.log("✓ encrypted file rejects empty passphrase");

  threw = false;
  try {
    parseOpenCopy(exported.bytes, "wrong-pass");
  } catch (err) {
    threw = err instanceof ImportError && err.code === "BAD_PASSPHRASE";
  }
  if (!threw) fail("expected BAD_PASSPHRASE for wrong passphrase");
  console.log("✓ wrong passphrase rejected");

  console.log("→ parsing + importing");
  const parsed = parseOpenCopy(exported.bytes, "correcthorsebatterystaple");
  if (parsed.manifest.source.workspace.name !== "Acme Marketing") {
    fail(
      `manifest workspace name mismatch: ${parsed.manifest.source.workspace.name}`,
    );
  }
  console.log(`✓ manifest decoded: ${parsed.manifest.source.workspace.name}`);

  const result = await importWorkspace(dest.db, parsed, importerId);
  console.log(`✓ imported workspace ${result.workspaceId}`);

  // Verify
  const importedWs = await dest.db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, result.workspaceId),
  });
  if (!importedWs || importedWs.name !== "Acme Marketing")
    fail("workspace mismatch");

  const importedVoices = await dest.db
    .select()
    .from(schema.brandVoices)
    .where(eq(schema.brandVoices.workspaceId, result.workspaceId));
  if (importedVoices.length !== 1)
    fail(`voices count: ${importedVoices.length}`);
  if (importedVoices[0].id === voiceId) fail("voice id should have been remapped");
  console.log(`✓ 1 brand voice (id remapped: ${importedVoices[0].id})`);

  const importedChunks = await dest.db
    .select()
    .from(schema.kbChunks)
    .where(eq(schema.kbChunks.workspaceId, result.workspaceId));
  if (importedChunks.length !== 3)
    fail(`chunks count: ${importedChunks.length}`);
  const withEmb = importedChunks.filter(
    (c: { embedding: number[] | null }) => c.embedding !== null,
  );
  if (withEmb.length !== 2)
    fail(`expected 2 embedded chunks, got ${withEmb.length}`);
  if (!withEmb[0].embedding || withEmb[0].embedding.length !== dim) {
    fail("embedding dimension mismatch");
  }
  console.log(`✓ 3 chunks (2 with embeddings @ ${dim} dims)`);

  // Float32 round-trip — values quantize but should match within tolerance.
  for (const orig of [emb1, emb2]) {
    const found = withEmb.find(
      (c: { embedding: number[] | null }) =>
        c.embedding && Math.abs(c.embedding[0] - orig[0]) < 1e-5,
    );
    if (!found)
      fail("could not match embedding back to original within float32 tolerance");
  }
  console.log("✓ embedding values round-trip within float32 tolerance");

  // Importer is owner
  const ownerCheck = await dest.db.query.members.findFirst({
    where: eq(schema.members.workspaceId, result.workspaceId),
  });
  if (ownerCheck?.userId !== importerId || ownerCheck.role !== "owner") {
    fail("importer should be owner of new workspace");
  }
  console.log("✓ importer is owner");

  // Sanity: a totally different workspace id was assigned
  if (result.workspaceId === wsId)
    fail("workspace id should have been remapped");

  // PGlite SQL sanity — ensure we can run a vector similarity query on the
  // imported data, the way searchKnowledge() does at runtime.
  const target = withEmb[0].embedding!;
  const sims = await dest.db.execute(
    sql`SELECT id, 1 - (embedding <=> ${`[${target.join(",")}]`}::vector) AS sim
        FROM kb_chunk
        WHERE workspace_id = ${result.workspaceId}
          AND embedding IS NOT NULL
        ORDER BY sim DESC
        LIMIT 1`,
  );
  if (!sims.rows.length || (sims.rows[0] as { sim: number }).sim < 0.99) {
    fail(
      `cosine similarity self-query degraded: ${JSON.stringify(sims.rows[0])}`,
    );
  }
  console.log("✓ pgvector cosine query against imported data works");

  await dest.client.close();
  rmSync(dest.dataDir, { recursive: true, force: true });
  console.log("\n✓ workspace export/import round-trip passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
