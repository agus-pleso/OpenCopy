// Reproduces the "Ollama save reports success but row never appears" bug.
//
// Spins up fresh PGlite, migrates, creates user + workspace + member, then
// replicates exactly what `saveApiKey` does for the Ollama provider. Reads
// the row back and the same way the AI settings page does, to verify it's
// visible to subsequent renders.
//
//   pnpm tsx scripts/test-ollama-save.ts

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, inArray } from "drizzle-orm";

import * as schema from "../src/db/schema";
import { encryptSecret, maskKey } from "../src/lib/crypto";

// getKey() reads ENCRYPTION_KEY lazily (per call), so setting it after import
// is fine — every encryptSecret() call below will see this value.
process.env.ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function setupDb() {
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-ollama-"));
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
 * Replicates the body of `saveApiKey` from src/server/actions/api-keys.ts —
 * minus the auth gating, since we're calling directly without a request
 * context. Same upsert logic, same encryption, same column names.
 */
async function saveApiKeyDirect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  workspaceId: string,
  userId: string,
  input: {
    provider: "ollama" | "openrouter";
    apiKey: string;
    baseUrl?: string;
    label?: string;
  },
) {
  const { provider, apiKey, baseUrl, label } = input;

  const effectiveKey = provider === "ollama" ? "ollama-local" : apiKey;
  const ciphertext = encryptSecret(effectiveKey);
  const last4 = provider === "ollama" ? "local" : maskKey(apiKey, 4);

  const existing = await db.query.apiKeys.findFirst({
    where: and(
      eq(schema.apiKeys.workspaceId, workspaceId),
      eq(schema.apiKeys.provider, provider),
    ),
  });

  if (existing) {
    await db
      .update(schema.apiKeys)
      .set({
        ciphertext,
        last4,
        baseUrl: baseUrl || null,
        label: label || existing.label,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.apiKeys.id, existing.id));
  } else {
    await db.insert(schema.apiKeys).values({
      workspaceId,
      provider,
      ciphertext,
      last4,
      baseUrl: baseUrl || null,
      label: label || null,
      createdByUserId: userId,
    });
  }

  return { ok: true, last4 };
}

/**
 * Replicates the read query from src/app/(app)/settings/ai/page.tsx so we
 * can confirm the row is visible to the same query the page uses.
 */
async function readAiSettingsApiKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  workspaceId: string,
) {
  return db
    .select()
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.workspaceId, workspaceId),
        inArray(schema.apiKeys.provider, [
          "openrouter",
          "anthropic",
          "openai",
          "google",
          "mistral",
          "ollama",
        ]),
      ),
    );
}

async function main() {
  console.log("→ setting up fresh PGlite + migrations");
  const { db, client, dataDir } = await setupDb();

  const userId = randomUUID();
  const wsId = randomUUID();

  await db.insert(schema.users).values({
    id: userId,
    email: "test@test.com",
    name: "Test",
    emailVerified: new Date(),
  });
  await db.insert(schema.workspaces).values({
    id: wsId,
    name: "Test workspace",
    slug: "test-ws",
    createdByUserId: userId,
  });
  await db.insert(schema.members).values({
    workspaceId: wsId,
    userId,
    role: "owner",
  });
  console.log(`✓ seeded user ${userId.slice(0, 8)} in workspace ${wsId.slice(0, 8)}`);

  // ─── Save Ollama ────────────────────────────────────────────────────────
  console.log("\n→ save Ollama (provider=ollama, baseUrl=http://localhost:11434/api)");
  const ollamaResult = await saveApiKeyDirect(db, wsId, userId, {
    provider: "ollama",
    apiKey: "",
    baseUrl: "http://localhost:11434/api",
    label: "Ollama (local)",
  });
  if (!ollamaResult.ok) fail("saveApiKeyDirect returned !ok for ollama");
  console.log(`✓ saveApiKey returned ok, last4=${ollamaResult.last4}`);

  // ─── Read back ──────────────────────────────────────────────────────────
  console.log("\n→ read api_keys via the AI settings page query");
  const rows = await readAiSettingsApiKeys(db, wsId);
  console.log(`  rows returned: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `  - ${r.provider} | last4=${r.last4} | baseUrl=${r.baseUrl} | active=${r.isActive}`,
    );
  }

  const ollamaRow = rows.find((r: { provider: string }) => r.provider === "ollama");
  if (!ollamaRow) {
    fail(
      `Ollama row NOT found via the page's query — this is the bug. ` +
        `${rows.length} rows total, providers: ${rows.map((r: { provider: string }) => r.provider).join(", ") || "<none>"}`,
    );
  }
  console.log("✓ Ollama row visible via page query");

  if (ollamaRow.baseUrl !== "http://localhost:11434/api") {
    fail(`baseUrl mismatch: ${ollamaRow.baseUrl}`);
  }
  if (ollamaRow.last4 !== "local") {
    fail(`last4 mismatch: ${ollamaRow.last4}`);
  }
  console.log("✓ baseUrl + last4 round-tripped correctly");

  // ─── Save OpenRouter (the working case, sanity check) ───────────────────
  console.log("\n→ save OpenRouter (sanity — this works in production)");
  await saveApiKeyDirect(db, wsId, userId, {
    provider: "openrouter",
    apiKey: "sk-or-v1-test1234567890ABCD",
    label: "OpenRouter",
  });
  const rows2 = await readAiSettingsApiKeys(db, wsId);
  console.log(`  rows after openrouter save: ${rows2.length}`);
  if (rows2.length !== 2) {
    fail(`expected 2 rows after both saves, got ${rows2.length}`);
  }
  const providers = rows2.map((r: { provider: string }) => r.provider).sort();
  if (providers.join(",") !== "ollama,openrouter") {
    fail(`unexpected providers: ${providers.join(",")}`);
  }
  console.log("✓ both rows present");

  // ─── Update path (re-save Ollama) ───────────────────────────────────────
  console.log("\n→ re-save Ollama with different URL (tests update branch)");
  await saveApiKeyDirect(db, wsId, userId, {
    provider: "ollama",
    apiKey: "",
    baseUrl: "http://192.168.1.50:11434/api",
    label: "Ollama (lan)",
  });
  const rows3 = await readAiSettingsApiKeys(db, wsId);
  if (rows3.length !== 2) {
    fail(`expected 2 rows after update (not insert), got ${rows3.length}`);
  }
  const updatedOllama = rows3.find(
    (r: { provider: string }) => r.provider === "ollama",
  );
  if (updatedOllama?.baseUrl !== "http://192.168.1.50:11434/api") {
    fail(`update baseUrl: ${updatedOllama?.baseUrl}`);
  }
  console.log("✓ update path works (baseUrl changed, no duplicate row)");

  await client.close();
  rmSync(dataDir, { recursive: true, force: true });
  console.log("\n✓ Ollama save smoke test passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
