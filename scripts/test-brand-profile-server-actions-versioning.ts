/**
 * Verify the brand_profile revision history + rollback semantics work
 * end-to-end against PGlite. Mirrors the pattern in
 * test-seo-locale-heuristics.ts:
 *
 *   - sets OPENCOPY_EMBEDDED_DB=1 BEFORE importing @/db/client so the
 *     embedded path is taken;
 *   - shims server-only;
 *   - drives migrations through the same client (no dual-PGlite deadlock);
 *   - seeds a user + workspace, inserts a brand_profile + revision, rolls
 *     back, and verifies the post-rollback state matches the earlier
 *     snapshot.
 *
 * Run: pnpm tsx scripts/test-brand-profile-server-actions-versioning.ts
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql, eq, desc, and } from "drizzle-orm";

const serverOnlyDir = resolve(__dirname, "..", "node_modules", "server-only");
if (!existsSync(serverOnlyDir)) {
  mkdirSync(serverOnlyDir, { recursive: true });
  writeFileSync(
    join(serverOnlyDir, "package.json"),
    JSON.stringify({ name: "server-only", main: "index.js" }),
  );
  writeFileSync(
    join(serverOnlyDir, "index.js"),
    "// Stub for tests — the real `server-only` throws to guard the client bundle.\n",
  );
}

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function main() {
  // ---------------------------------------------------------------------
  // 1. Spin up an isolated PGlite via @/db/client.
  // ---------------------------------------------------------------------
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-brand-profile-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";
  // Encryption key for the BYOK cookie test (not used here but required if
  // imports touch crypto.ts indirectly).
  process.env.ENCRYPTION_KEY = "dGVzdC1lbmNyeXB0aW9uLWtleS1mb3Itc21va2UtdGVzdHM=";

  console.log("→ migrate PGlite via @/db/client");
  const clientMod = await import("../src/db/client");
  const schema = await import("../src/db/schema");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = clientMod.db as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = clientMod.pool as any;

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });

  const [user] = await db
    .insert(schema.users)
    .values({ name: "Diana", email: "diana@example.com" })
    .returning();
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: "Diana's brand",
      slug: "dianas-brand-versioning",
      defaultLocale: "en",
      createdByUserId: user.id,
    })
    .returning();
  console.log("✓ seeded user + workspace");

  // ---------------------------------------------------------------------
  // 2. Insert an initial brand profile + revision.
  // ---------------------------------------------------------------------
  const baseProfile = {
    workspaceId: workspace.id,
    name: "Acme Coffee",
    tagline: "Specialty roasts",
    mission: null,
    values: ["transparency", "craft"],
    locales: ["en", "pl"] as const,
    voice: {
      en: {
        toneDescriptors: ["warm"],
        voicePersona: "Neighborhood barista",
        audience: "Coffee enthusiasts",
        readingLevel: "8th grade",
        formality: 3,
        emotionalRegister: "warm-curious",
        dos: [],
        donts: [],
        vocabularyPreferences: [],
        requiredWords: [],
        forbiddenWords: ["curated"],
        samplePieces: [],
        fromSampleAnalysis: false,
      },
    },
    knowledge: { offerings: [], facts: [], faqs: [] },
    audiences: {},
    positioning: {
      differentiators: ["On-site roasting"],
      brandValues: ["Transparency"],
      standsFor: [],
      standsAgainst: [],
    },
    competitors: [],
    onboardingComplete: false,
    createdByUserId: user.id,
  };
  const [profileV1] = await db
    .insert(schema.brandProfiles)
    .values(baseProfile)
    .returning();
  console.log("✓ inserted brand_profile v1");

  await db.insert(schema.brandProfileRevisions).values({
    profileId: profileV1.id,
    workspaceId: workspace.id,
    snapshot: profileV1,
    revisionType: "initial",
    note: "Initial state.",
    createdByUserId: user.id,
  });
  console.log("✓ wrote initial revision");

  // ---------------------------------------------------------------------
  // 3. Apply a "save" (simulating sendOnboardingTurn's capturedPatch path)
  //    and record a new revision.
  // ---------------------------------------------------------------------
  const updatedVoice = {
    ...profileV1.voice,
    en: {
      ...profileV1.voice.en!,
      toneDescriptors: ["warm", "wry", "plainspoken"],
      formality: 4,
    },
  };
  const [profileV2] = await db
    .update(schema.brandProfiles)
    .set({
      voice: updatedVoice,
      values: ["transparency", "craft", "neighborhood-first"],
      updatedAt: new Date(),
    })
    .where(eq(schema.brandProfiles.id, profileV1.id))
    .returning();

  await db.insert(schema.brandProfileRevisions).values({
    profileId: profileV2.id,
    workspaceId: workspace.id,
    snapshot: profileV2,
    revisionType: "manual_save",
    note: "Voice tone broadened, neighborhood value added.",
    createdByUserId: user.id,
  });
  console.log("✓ wrote v2 (set tone + values)");

  // ---------------------------------------------------------------------
  // 4. Apply an NL-command-driven change (different revisionType).
  // ---------------------------------------------------------------------
  const [profileV3] = await db
    .update(schema.brandProfiles)
    .set({
      tagline: "Coffee for people who notice",
      updatedAt: new Date(),
    })
    .where(eq(schema.brandProfiles.id, profileV1.id))
    .returning();

  await db.insert(schema.brandProfileRevisions).values({
    profileId: profileV3.id,
    workspaceId: workspace.id,
    snapshot: profileV3,
    revisionType: "nl_command",
    note: "NL command: change tagline",
    createdByUserId: user.id,
  });
  console.log("✓ wrote v3 (NL command on tagline)");

  // ---------------------------------------------------------------------
  // 5. List revisions: expect 3 in descending order.
  // ---------------------------------------------------------------------
  const revs = await db.query.brandProfileRevisions.findMany({
    where: and(
      eq(schema.brandProfileRevisions.profileId, profileV1.id),
      eq(schema.brandProfileRevisions.workspaceId, workspace.id),
    ),
    orderBy: [desc(schema.brandProfileRevisions.createdAt)],
  });
  if (revs.length !== 3) fail(`expected 3 revisions, got ${revs.length}`);
  // Order: most recent (nl_command) → manual_save → initial
  if (revs[0].revisionType !== "nl_command") {
    fail(`top rev should be nl_command, got ${revs[0].revisionType}`);
  }
  if (revs[2].revisionType !== "initial") {
    fail(`bottom rev should be initial, got ${revs[2].revisionType}`);
  }
  console.log("✓ revisions list in correct order");

  // ---------------------------------------------------------------------
  // 6. Roll back to v1 (initial). Mirrors what `rollBackTo` does: load
  //    snapshot → write fields back → write NEW roll_back revision.
  // ---------------------------------------------------------------------
  const targetRev = revs[2]; // the initial revision
  const snap = targetRev.snapshot as typeof profileV1;
  const [profileV4] = await db
    .update(schema.brandProfiles)
    .set({
      name: snap.name,
      tagline: snap.tagline,
      mission: snap.mission,
      values: snap.values,
      locales: snap.locales,
      voice: snap.voice,
      knowledge: snap.knowledge,
      audiences: snap.audiences,
      positioning: snap.positioning,
      competitors: snap.competitors,
      onboardingComplete: snap.onboardingComplete,
      updatedAt: new Date(),
    })
    .where(eq(schema.brandProfiles.id, profileV1.id))
    .returning();

  await db.insert(schema.brandProfileRevisions).values({
    profileId: profileV4.id,
    workspaceId: workspace.id,
    snapshot: profileV4,
    revisionType: "roll_back",
    note: `Rolled back to ${targetRev.id}`,
    createdByUserId: user.id,
  });
  console.log("✓ rolled back to initial snapshot");

  // ---------------------------------------------------------------------
  // 7. Verify the post-rollback state matches the earlier initial snapshot
  //    (in the load-bearing dimensions — tagline, values, voice formality).
  // ---------------------------------------------------------------------
  const post = await db.query.brandProfiles.findFirst({
    where: eq(schema.brandProfiles.id, profileV1.id),
  });
  if (!post) fail("profile vanished after rollback");
  if (post!.tagline !== "Specialty roasts")
    fail(`tagline didn't restore: ${post!.tagline}`);
  if (post!.values.length !== 2)
    fail(`values didn't restore: ${JSON.stringify(post!.values)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voiceEn = (post as any).voice.en;
  if (voiceEn.formality !== 3)
    fail(`voice.en.formality didn't restore: ${voiceEn.formality}`);
  if (voiceEn.toneDescriptors.length !== 1)
    fail(`voice.en.toneDescriptors didn't restore: ${JSON.stringify(voiceEn.toneDescriptors)}`);
  console.log("✓ post-rollback state matches initial snapshot");

  // ---------------------------------------------------------------------
  // 8. List revisions again — expect 4 now (with roll_back at top).
  // ---------------------------------------------------------------------
  const finalRevs = await db.query.brandProfileRevisions.findMany({
    where: and(
      eq(schema.brandProfileRevisions.profileId, profileV1.id),
      eq(schema.brandProfileRevisions.workspaceId, workspace.id),
    ),
    orderBy: [desc(schema.brandProfileRevisions.createdAt)],
  });
  if (finalRevs.length !== 4) fail(`expected 4 revisions after rollback, got ${finalRevs.length}`);
  if (finalRevs[0].revisionType !== "roll_back")
    fail(`top rev should be roll_back, got ${finalRevs[0].revisionType}`);
  console.log("✓ roll_back logged as new revision");

  // ---------------------------------------------------------------------
  // 9. Workspace delete cascades through profile + revisions + chats.
  // ---------------------------------------------------------------------
  await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id));
  const remainingProfiles = await db
    .select()
    .from(schema.brandProfiles)
    .where(eq(schema.brandProfiles.workspaceId, workspace.id));
  if (remainingProfiles.length !== 0) fail("profile should cascade-delete");
  const remainingRevs = await db
    .select()
    .from(schema.brandProfileRevisions)
    .where(eq(schema.brandProfileRevisions.workspaceId, workspace.id));
  if (remainingRevs.length !== 0) fail("revisions should cascade-delete");
  console.log("✓ workspace delete cascades");

  await pool.close?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__opencopyDb = undefined;
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ brand-profile versioning smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
