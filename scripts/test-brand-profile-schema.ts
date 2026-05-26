// Smoke test for the brand profile schema (Phase 0 of the conversational
// config feature). Sets up an in-process PGlite via @/db/client (to avoid
// the dual-PGlite deadlock pattern), exercises the 6 new tables end-to-end:
// brand_profile (unique-per-workspace), brand_profile_revision (full
// snapshot history), brand_profile_chat + brand_profile_chat_message
// (transcript threads with structured patches per turn),
// brand_profile_crawl (cached extraction, unique on workspace+url+jsRendered),
// brand_profile_cookie (BYOK encrypted store).
//
//   pnpm tsx scripts/test-brand-profile-schema.ts

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql, and, eq } from "drizzle-orm";

// Stub `server-only` — same pattern as test-seo-locale-heuristics.ts.
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
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-brand-profile-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";

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
  console.log("✓ migrations applied");

  console.log("\n→ seed user + workspace");
  const [user] = await db
    .insert(schema.users)
    .values({ name: "Diana", email: "diana@example.com" })
    .returning();
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: "Diana's brand",
      slug: "dianas-brand",
      defaultLocale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  console.log(`✓ seeded (workspace=${workspace.id})`);

  console.log("\n→ insert brand_profile with full BrandProfile shape");
  const voicePl: schema.BrandProfileVoiceVariant = {
    toneDescriptors: ["plainspoken", "warm", "confident"],
    voicePersona: "Senior practitioner who took CBT training in Krakow.",
    audience: "Adults in Poland exploring therapy for the first time.",
    readingLevel: "8th grade",
    formality: 5,
    emotionalRegister: "calm, grounded",
    dos: [{ rule: "Lead with the reader's reality", why: "Earns attention" }],
    donts: [{ rule: "Don't pathologise", why: "Bad outcome" }],
    vocabularyPreferences: ["wsparcie", "pomoc psychologiczna"],
    requiredWords: [],
    forbiddenWords: ["szaleństwo"],
    samplePieces: ["Pierwsza wizyta to dobry pierwszy krok."],
    fromSampleAnalysis: true,
  };
  const voiceEn: schema.BrandProfileVoiceVariant = {
    toneDescriptors: ["plainspoken", "warm"],
    voicePersona: "Bilingual practitioner with international training.",
    audience: "English-speaking expats in Poland.",
    readingLevel: "8th grade",
    formality: 4,
    emotionalRegister: "calm, grounded",
    dos: [{ rule: "Anchor in concrete steps" }],
    donts: [{ rule: "Avoid clinical jargon" }],
    vocabularyPreferences: ["support", "first session"],
    requiredWords: [],
    forbiddenWords: ["crazy"],
    samplePieces: ["The first visit is just a conversation."],
    fromSampleAnalysis: false,
  };
  const audiencesPl: schema.BrandProfileAudience[] = [
    {
      id: crypto.randomUUID(),
      name: "First-time seeker",
      demographics: "25-45, urban PL",
      psychographics: "Curious, anxious about stigma",
      painPoints: ["Anxiety", "Sleep"],
      jobsToBeDone: ["Find a vetted English-speaking therapist"],
      decisionCriteria: ["Languages spoken", "Reviews"],
    },
  ];

  const [profile] = await db
    .insert(schema.brandProfiles)
    .values({
      workspaceId: workspace.id,
      name: "Diana Therapy Co.",
      tagline: "Therapy that fits how you actually live.",
      mission: "Make first-session anxiety bearable.",
      values: ["honesty", "craft"],
      locales: ["en", "pl"],
      voice: { en: voiceEn, pl: voicePl },
      knowledge: {
        offerings: [
          {
            name: "Individual therapy",
            description: "50-min sessions, CBT or psychodynamic.",
          },
        ],
        facts: [{ fact: "PL-licensed since 2019" }],
        faqs: [
          {
            question: "Are sessions covered by insurance?",
            answer: "Partial reimbursement via private insurers.",
          },
        ],
      },
      audiences: { pl: audiencesPl },
      positioning: {
        differentiators: ["Bilingual", "Evidence-based"],
        brandValues: ["honesty", "craft"],
        standsFor: ["destigmatising therapy"],
        standsAgainst: ["one-size-fits-all"],
      },
      competitors: [
        {
          id: crypto.randomUUID(),
          name: "BetterHelp",
          url: "https://betterhelp.com",
          positioning: "Global, app-based",
          whyTheyWin: ["Brand recognition"],
          whyWeWin: ["In-person + PL-licensed"],
        },
      ],
      createdByUserId: user.id,
    })
    .returning();
  if (!profile) fail("profile insert returned no row");
  console.log(`✓ inserted profile (id=${profile.id})`);

  console.log("\n→ uniqueness: one profile per workspace");
  let dupCaught = false;
  try {
    await db.insert(schema.brandProfiles).values({
      workspaceId: workspace.id,
      name: "Second profile attempt",
      createdByUserId: user.id,
    });
  } catch {
    dupCaught = true;
  }
  if (!dupCaught) fail("duplicate workspace_id should have failed unique index");
  console.log("✓ unique-per-workspace enforced");

  console.log("\n→ round-trip jsonb shapes survive");
  const [readBack] = await db
    .select()
    .from(schema.brandProfiles)
    .where(eq(schema.brandProfiles.id, profile.id));
  if (!readBack) fail("read-back: no row");
  if (readBack.voice.pl?.toneDescriptors[0] !== "plainspoken") {
    fail(
      `voice.pl.toneDescriptors lost — got ${JSON.stringify(readBack.voice.pl?.toneDescriptors)}`,
    );
  }
  if (readBack.competitors[0]?.whyWeWin[0] !== "In-person + PL-licensed") {
    fail("competitors[0].whyWeWin lost");
  }
  if (readBack.audiences.pl?.[0]?.painPoints.length !== 2) {
    fail("audiences nested painPoints lost");
  }
  console.log("✓ jsonb deep round-trip clean");

  console.log("\n→ snapshot history: insert revision + verify ordering");
  await db.insert(schema.brandProfileRevisions).values({
    profileId: profile.id,
    workspaceId: workspace.id,
    snapshot: readBack,
    revisionType: "initial",
    note: "After first onboarding chat",
    createdByUserId: user.id,
  });
  await db.insert(schema.brandProfileRevisions).values({
    profileId: profile.id,
    workspaceId: workspace.id,
    snapshot: { ...readBack, name: "Diana Therapy Co. v2" },
    revisionType: "nl_command",
    note: "make Polish voice more formal",
    createdByUserId: user.id,
  });
  const revisions = await db
    .select()
    .from(schema.brandProfileRevisions)
    .where(eq(schema.brandProfileRevisions.profileId, profile.id))
    .orderBy(schema.brandProfileRevisions.createdAt);
  if (revisions.length !== 2) {
    fail(`expected 2 revisions, got ${revisions.length}`);
  }
  if (revisions[1].snapshot.name !== "Diana Therapy Co. v2") {
    fail("revision snapshot didn't round-trip");
  }
  console.log("✓ revisions persist and order");

  console.log("\n→ chat thread + messages with structured patches");
  const [chat] = await db
    .insert(schema.brandProfileChats)
    .values({
      profileId: profile.id,
      workspaceId: workspace.id,
      kind: "onboarding",
      title: "Onboarding · Voice",
      axis: "voice",
      locale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  await db.insert(schema.brandProfileChatMessages).values([
    {
      chatId: chat.id,
      workspaceId: workspace.id,
      role: "assistant",
      content: "Tell me what your brand does, in one sentence.",
      structuredPatch: null,
    },
    {
      chatId: chat.id,
      workspaceId: workspace.id,
      role: "user",
      content: "We're a bilingual therapy practice in Krakow.",
      structuredPatch: null,
    },
    {
      chatId: chat.id,
      workspaceId: workspace.id,
      role: "assistant",
      content: "Got it. What's the formality range you target?",
      structuredPatch: { mission: "Bilingual therapy practice in Krakow." },
      modelId: "anthropic/claude-sonnet-4.6",
      inputTokens: 1200,
      outputTokens: 60,
      durationMs: 1850,
    },
  ]);
  const messages = await db
    .select()
    .from(schema.brandProfileChatMessages)
    .where(eq(schema.brandProfileChatMessages.chatId, chat.id))
    .orderBy(schema.brandProfileChatMessages.createdAt);
  if (messages.length !== 3) fail(`expected 3 messages, got ${messages.length}`);
  const lastMsg = messages[messages.length - 1];
  if (
    !lastMsg.structuredPatch ||
    (lastMsg.structuredPatch as { mission?: string }).mission !==
      "Bilingual therapy practice in Krakow."
  ) {
    fail("structuredPatch jsonb didn't round-trip");
  }
  console.log("✓ chat + messages with patches round-trip");

  console.log("\n→ crawl cache: unique on (workspace, url, jsRendered)");
  await db.insert(schema.brandProfileCrawls).values({
    workspaceId: workspace.id,
    url: "https://diana-therapy.example",
    finalUrl: "https://diana-therapy.example/",
    extractedContent: {
      pages: [
        {
          url: "https://diana-therapy.example/",
          locale: "pl",
          title: "Diana Therapy",
          text: "Wsparcie psychologiczne...",
          headings: { h1: ["Diana Therapy"], h2: ["O nas"], h3: [] },
        },
      ],
      detectedLocales: ["pl", "en"],
      sitemapFound: true,
      robotsBlocked: false,
    },
    status: "ready",
    jsRendered: false,
    crawledAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdByUserId: user.id,
  });
  let crawlDupCaught = false;
  try {
    await db.insert(schema.brandProfileCrawls).values({
      workspaceId: workspace.id,
      url: "https://diana-therapy.example",
      jsRendered: false,
      status: "pending",
      createdByUserId: user.id,
    });
  } catch {
    crawlDupCaught = true;
  }
  if (!crawlDupCaught) {
    fail("duplicate (workspace, url, false) crawl should have failed");
  }
  // Same URL + jsRendered=true should be allowed (different bucket).
  await db.insert(schema.brandProfileCrawls).values({
    workspaceId: workspace.id,
    url: "https://diana-therapy.example",
    jsRendered: true,
    status: "pending",
    createdByUserId: user.id,
  });
  console.log("✓ crawl uniqueness allows static vs js-rendered split");

  console.log("\n→ BYOK cookie store roundtrip");
  await db.insert(schema.brandProfileCookies).values({
    workspaceId: workspace.id,
    domain: "internal.diana.example",
    label: "Staff portal cookie",
    ciphertext: "AES-256-GCM:base64-placeholder",
    last4: "abc1",
    createdByUserId: user.id,
  });
  const cookies = await db
    .select()
    .from(schema.brandProfileCookies)
    .where(eq(schema.brandProfileCookies.workspaceId, workspace.id));
  if (cookies.length !== 1) fail(`expected 1 cookie, got ${cookies.length}`);
  console.log("✓ cookie store accepts encrypted blobs");

  console.log("\n→ FK cascade: deleting workspace removes profile + chats + crawls + cookies");
  await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id));

  const remainingProfile = await db
    .select()
    .from(schema.brandProfiles)
    .where(eq(schema.brandProfiles.workspaceId, workspace.id));
  const remainingRevisions = await db
    .select()
    .from(schema.brandProfileRevisions)
    .where(eq(schema.brandProfileRevisions.workspaceId, workspace.id));
  const remainingChats = await db
    .select()
    .from(schema.brandProfileChats)
    .where(eq(schema.brandProfileChats.workspaceId, workspace.id));
  const remainingMessages = await db
    .select()
    .from(schema.brandProfileChatMessages)
    .where(eq(schema.brandProfileChatMessages.workspaceId, workspace.id));
  const remainingCrawls = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(eq(schema.brandProfileCrawls.workspaceId, workspace.id));
  const remainingCookies = await db
    .select()
    .from(schema.brandProfileCookies)
    .where(eq(schema.brandProfileCookies.workspaceId, workspace.id));

  if (remainingProfile.length !== 0) fail("profile didn't cascade");
  if (remainingRevisions.length !== 0) fail("revisions didn't cascade");
  if (remainingChats.length !== 0) fail("chats didn't cascade");
  if (remainingMessages.length !== 0) fail("messages didn't cascade");
  if (remainingCrawls.length !== 0) fail("crawls didn't cascade");
  if (remainingCookies.length !== 0) fail("cookies didn't cascade");
  console.log("✓ workspace cascade reaches all 6 brand_profile_* tables");

  await pool.close?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__opencopyDb = undefined;
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ brand profile schema smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
