// Smoke test for the manual-library exemplar lane.
//
// Spins up a fresh PGlite, migrates, seeds manual library entries with
// different channel/locale/voice combos, then exercises retrieveExemplars
// to confirm filtering works the way the copywriter drafter expects.
//
//   pnpm tsx scripts/test-manual-library-exemplars.ts

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "../src/db/schema";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function setupDb() {
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-exemplar-"));
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

/**
 * Mini-replica of `retrieveExemplars` from src/lib/kb/exemplar-retrieval.ts —
 * inlined so the test doesn't depend on `db/client.ts` (which constructs its
 * own PGlite via env vars and would conflict with our test-controlled db).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function retrieveExemplarsTest(db: any, opts: {
  workspaceId: string;
  channel?: string;
  locale?: string;
  voiceId?: string | null;
  maxCount?: number;
}) {
  const { and, desc, eq } = await import("drizzle-orm");
  const max = opts.maxCount ?? 4;
  const conditions = [
    eq(schema.libraryEntries.workspaceId, opts.workspaceId),
    eq(schema.libraryEntries.source, "manual" as const),
  ];
  if (opts.channel)
    conditions.push(eq(schema.libraryEntries.channel, opts.channel));
  if (opts.locale)
    conditions.push(eq(schema.libraryEntries.locale, opts.locale));
  if (opts.voiceId)
    conditions.push(eq(schema.libraryEntries.voiceId, opts.voiceId));
  return db.query.libraryEntries.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.libraryEntries.createdAt)],
    limit: max,
  });
}

async function main() {
  console.log("→ setting up fresh PGlite + migrations");
  const { db, client, dataDir } = await setupDb();

  const userId = randomUUID();
  const wsId = randomUUID();
  const voiceA = randomUUID();
  const voiceB = randomUUID();

  await db.insert(schema.users).values({
    id: userId,
    email: "test@test.com",
    emailVerified: new Date(),
  });
  await db.insert(schema.workspaces).values({
    id: wsId,
    name: "Test",
    slug: "test",
    createdByUserId: userId,
  });
  await db.insert(schema.members).values({
    workspaceId: wsId,
    userId,
    role: "owner" as const,
  });
  await db.insert(schema.brandVoices).values([
    { id: voiceA, workspaceId: wsId, name: "Voice A", createdByUserId: userId },
    { id: voiceB, workspaceId: wsId, name: "Voice B", createdByUserId: userId },
  ]);
  console.log("✓ seeded workspace + 2 voices");

  // Seed: 1 generated chat_message + 4 manual entries with varied scopes.
  console.log("\n→ seeding entries (1 generated + 4 manual)");
  await db.insert(schema.libraryEntries).values([
    {
      workspaceId: wsId,
      kind: "chat_message" as const,
      source: "generated" as const,
      content: "AI-saved chat reply (should NOT show as exemplar)",
      voiceId: voiceA,
      locale: "en" as const,
      savedByUserId: userId,
    },
    {
      workspaceId: wsId,
      kind: "manual" as const,
      source: "manual" as const,
      content: "Email exemplar in EN, voice A",
      title: "EN email gold",
      channel: "email" as const,
      voiceId: voiceA,
      locale: "en" as const,
      savedByUserId: userId,
    },
    {
      workspaceId: wsId,
      kind: "manual" as const,
      source: "manual" as const,
      content: "Email exemplar in PL, voice A",
      channel: "email" as const,
      voiceId: voiceA,
      locale: "pl" as const,
      savedByUserId: userId,
    },
    {
      workspaceId: wsId,
      kind: "manual" as const,
      source: "manual" as const,
      content: "Ad exemplar in EN, voice A",
      channel: "ad" as const,
      voiceId: voiceA,
      locale: "en" as const,
      savedByUserId: userId,
    },
    {
      workspaceId: wsId,
      kind: "manual" as const,
      source: "manual" as const,
      content: "Email exemplar in EN, voice B (different voice)",
      channel: "email" as const,
      voiceId: voiceB,
      locale: "en" as const,
      savedByUserId: userId,
    },
  ]);
  console.log("✓ seeded");

  // 1) Channel + locale + voice filter — should find exactly the 1 matching entry
  console.log("\n→ retrieve(channel=email, locale=en, voice=A)");
  const r1 = await retrieveExemplarsTest(db, {
    workspaceId: wsId,
    channel: "email",
    locale: "en",
    voiceId: voiceA,
  });
  if (r1.length !== 1) fail(`expected 1, got ${r1.length}`);
  if (!r1[0].content.includes("EN, voice A"))
    fail(`wrong row: ${r1[0].content}`);
  console.log(`✓ 1 match (correct content)`);

  // 2) No voice filter — should find 2 (both voice A and voice B for email/en)
  console.log("\n→ retrieve(channel=email, locale=en) — no voice filter");
  const r2 = await retrieveExemplarsTest(db, {
    workspaceId: wsId,
    channel: "email",
    locale: "en",
  });
  if (r2.length !== 2) fail(`expected 2, got ${r2.length}`);
  console.log(`✓ 2 matches (voice-agnostic)`);

  // 3) Generated chat_message must NEVER surface as an exemplar
  console.log("\n→ retrieve(no filters except workspace) — only manuals come back");
  const r3 = await retrieveExemplarsTest(db, { workspaceId: wsId, maxCount: 100 });
  if (r3.length !== 4) fail(`expected 4 manual rows, got ${r3.length}`);
  if (r3.some((r: { source: string }) => r.source !== "manual"))
    fail("generated row leaked into exemplar retrieval");
  console.log(`✓ 4 matches, all source=manual (generated row correctly filtered)`);

  // 4) maxCount caps results
  console.log("\n→ retrieve(maxCount=2)");
  const r4 = await retrieveExemplarsTest(db, { workspaceId: wsId, maxCount: 2 });
  if (r4.length !== 2) fail(`expected 2 (cap), got ${r4.length}`);
  console.log(`✓ cap honored`);

  await client.close();
  rmSync(dataDir, { recursive: true, force: true });
  console.log("\n✓ manual exemplar retrieval works end-to-end");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
