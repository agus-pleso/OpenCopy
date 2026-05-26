"use server";

/**
 * Brand-profile server actions — Phase 1A wiring.
 *
 * Surface:
 *   - getOrCreateBrandProfile      // singleton per workspace
 *   - startOnboardingChat / sendOnboardingTurn / completeOnboarding
 *   - startExtractor / getCrawlResult / applyExtractorProposal
 *   - reopenChat (re-renders the literal transcript)
 *   - runNlCommand  (Mode B Cmd+K NL palette)
 *   - listRevisions / rollBackTo
 *   - startDeepDive / sendDeepDiveTurn
 *   - saveCookieProfile / listCookieProfiles / deleteCookieProfile (BYOK)
 *
 * Every write goes through a brand_profile_revision row so the rollback UI
 * (Phase 1C) has a clean snapshot history to traverse.
 *
 * Auth pattern matches voices.ts: every action gates on requireUserId +
 * getCurrentWorkspace + requireRole("editor") for writes.
 */

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  brandProfiles,
  brandProfileChats,
  brandProfileChatMessages,
  brandProfileCookies,
  brandProfileCrawls,
  brandProfileRevisions,
  brandVoices,
  type BrandProfile,
  type BrandProfileChatKind,
  type BrandProfileChatMessage,
  type BrandProfileCrawl,
  type BrandProfileKnowledge,
  type BrandProfilePositioning,
  type BrandProfileRevision,
  type BrandProfileVoiceVariant,
  type Locale,
  localeEnum,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";
import { encryptSecret } from "@/lib/crypto";
import { runAgent } from "@/lib/agents/core";
import { runVoiceAnalyzer } from "@/lib/agents/voice-analyzer";
import {
  runBrandProfileConversationalist,
  type ConversationalistAxis,
  type ConversationalistMessage,
} from "@/lib/agents/brand-profile-conversationalist";
import { runBrandProfileExtractor } from "@/lib/agents/brand-profile-extractor";
import {
  brandProfileEditor,
  type NlCommandPatch,
} from "@/lib/agents/brand-profile-editor";
import {
  applyNlPatch,
  type PatchDiffEntry,
} from "@/lib/agents/brand-profile-patch";
import { runBrandProfileSeoDeepDive } from "@/lib/agents/brand-profile-deep-dive-seo";
import { runBrandProfileLocalizerDeepDive } from "@/lib/agents/brand-profile-deep-dive-localizer";
import { crawlSite, type CrawlResult } from "@/lib/brand-profile/crawler";

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);

const SendOnboardingTurnSchema = z.object({
  chatId: z.string().uuid(),
  userMessage: z.string().min(1).max(20_000),
  pastedSamples: z
    .array(
      z.object({
        content: z.string().min(1).max(50_000),
        locale: LocaleEnum,
      }),
    )
    .max(20)
    .optional(),
});

const StartExtractorSchema = z.object({
  url: z.string().url().max(1000),
  jsRendered: z.boolean().optional(),
  cookieProfileId: z.string().uuid().optional(),
});

const ApplyExtractorProposalSchema = z.object({
  crawlId: z.string().uuid(),
  proposalOverrides: z.record(z.string(), z.unknown()).optional(),
});

const NlCommandSchema = z.object({
  command: z.string().min(1).max(2000),
});

const StartDeepDiveSchema = z.object({
  kind: z.enum(["seo_deep_dive", "localizer_deep_dive"]),
  locale: LocaleEnum.optional(),
});

const SendDeepDiveTurnSchema = z.object({
  chatId: z.string().uuid(),
  userMessage: z.string().min(1).max(20_000),
});

const SaveCookieProfileSchema = z.object({
  domain: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  cookieValue: z.string().min(1).max(20_000),
});

const ChatIdSchema = z.string().uuid();
const RevisionIdSchema = z.string().uuid();
const CookieIdSchema = z.string().uuid();
const CrawlIdSchema = z.string().uuid();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const EMPTY_KNOWLEDGE: BrandProfileKnowledge = {
  offerings: [],
  facts: [],
  faqs: [],
};

const EMPTY_POSITIONING: BrandProfilePositioning = {
  differentiators: [],
  brandValues: [],
  standsFor: [],
  standsAgainst: [],
};

const ONBOARDING_TURNS = 25;
const DEEP_DIVE_TURNS = 8;

/**
 * Write a `brand_profile_revision` snapshot row. Every save action funnels
 * here so the rollback UI has a uniform history surface. The `snapshot` jsonb
 * column carries the FULL profile so rollback is just "load snapshot → write
 * back".
 */
async function writeRevision(args: {
  profile: BrandProfile;
  workspaceId: string;
  userId: string;
  revisionType:
    | "initial"
    | "manual_save"
    | "nl_command"
    | "deep_dive_save"
    | "crawl_extract"
    | "roll_back"
    | "voice_analyzer";
  note?: string;
}): Promise<void> {
  await db.insert(brandProfileRevisions).values({
    profileId: args.profile.id,
    workspaceId: args.workspaceId,
    snapshot: args.profile,
    revisionType: args.revisionType,
    note: args.note ?? null,
    createdByUserId: args.userId,
  });
}

/** Read the chat's message history in chronological order. */
async function loadChatMessages(
  chatId: string,
  workspaceId: string,
): Promise<BrandProfileChatMessage[]> {
  return db.query.brandProfileChatMessages.findMany({
    where: and(
      eq(brandProfileChatMessages.chatId, chatId),
      eq(brandProfileChatMessages.workspaceId, workspaceId),
    ),
    orderBy: [asc(brandProfileChatMessages.createdAt)],
  });
}

/** Convert DB-row messages to the conversationalist's expected shape. */
function toConversationalistMessages(
  rows: BrandProfileChatMessage[],
): ConversationalistMessage[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
      capturedPatch: (r.structuredPatch as Record<string, unknown> | null) ?? null,
    }));
}

/**
 * Fold an array of partial patches into a draft profile. Patches are the
 * `## Captured` blocks from the conversationalist — they may carry
 * top-level keys like `name`, `tagline`, OR dotted keys like `voice.pl`.
 * We treat them the same way `applyNlPatch` does for set operations.
 */
function foldPatchesIntoDraft(
  base: Partial<BrandProfile>,
  patches: Array<Record<string, unknown> | null>,
): Partial<BrandProfile> {
  // Reuse applyNlPatch's set semantics via a minimal shim. We construct a
  // synthetic "profile" with the partial as a starting point and apply each
  // patch entry as a set change.
  let draft: Partial<BrandProfile> = JSON.parse(JSON.stringify(base));
  for (const patch of patches) {
    if (!patch || typeof patch !== "object") continue;
    for (const [key, value] of Object.entries(patch)) {
      draft = setAtDottedPath(draft, key, value);
    }
  }
  return draft;
}

/** Mutate-style set at a dotted path. Returns the same object reference. */
function setAtDottedPath(
  obj: Partial<BrandProfile>,
  path: string,
  value: unknown,
): Partial<BrandProfile> {
  const parts = path.split(".").filter((s) => s.length > 0);
  if (parts.length === 0) return obj;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== "object" || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
  return obj;
}

/** Count how many turns we've spent in the current axis. */
function countTurnsInAxis(
  messages: BrandProfileChatMessage[],
  axis: string,
): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    // The chat's `axis` column is updated per-message; we'll seed it
    // from the structuredPatch's `_axisAtTurn` marker that we write
    // alongside captures. Lacking that, count messages from the most
    // recent axis transition.
    const turnAxis = ((m.structuredPatch ?? null) as Record<string, unknown> | null)
      ?._axisAtTurn;
    if (typeof turnAxis === "string" && turnAxis !== axis) break;
    count += 1;
  }
  return count;
}

/** Convert a VoiceCard (from voice-analyzer) into the schema's
 *  BrandProfileVoiceVariant shape. Field mapping mirrors voice-analyzer
 *  output → the canonical per-locale voice variant. */
function voiceCardToVariant(card: {
  tone_descriptors: string[];
  voice_persona: string;
  audience: string;
  reading_level: string;
  dos: { rule: string; why?: string }[];
  donts: { rule: string; why?: string }[];
  required_words: string[];
  forbidden_words: string[];
}): BrandProfileVoiceVariant {
  return {
    toneDescriptors: card.tone_descriptors,
    voicePersona: card.voice_persona,
    audience: card.audience,
    readingLevel: card.reading_level,
    // Sample-derived voices haven't surfaced an explicit formality dial
    // — start at the middle and let the marketer adjust via NL command.
    formality: 5,
    emotionalRegister: "",
    dos: card.dos,
    donts: card.donts,
    vocabularyPreferences: [],
    requiredWords: card.required_words,
    forbiddenWords: card.forbidden_words,
    samplePieces: [],
    fromSampleAnalysis: true,
  };
}

/* -------------------------------------------------------------------------- */
/* getOrCreateBrandProfile                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One brand_profile per workspace. If one already exists, return it; if not,
 * create an empty shell + the "initial" revision and return it. Safe to call
 * on every dashboard render.
 */
export async function getOrCreateBrandProfile(): Promise<BrandProfile> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const existing = await db.query.brandProfiles.findFirst({
    where: eq(brandProfiles.workspaceId, workspace.id),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(brandProfiles)
    .values({
      workspaceId: workspace.id,
      name: workspace.name,
      values: [],
      locales: ["en"],
      voice: {},
      knowledge: EMPTY_KNOWLEDGE,
      audiences: {},
      positioning: EMPTY_POSITIONING,
      competitors: [],
      onboardingComplete: false,
      createdByUserId: userId,
    })
    .returning();

  await writeRevision({
    profile: created,
    workspaceId: workspace.id,
    userId,
    revisionType: "initial",
    note: "Empty profile created on first workspace touch.",
  });

  return created;
}

/* -------------------------------------------------------------------------- */
/* Onboarding chat                                                            */
/* -------------------------------------------------------------------------- */

export async function startOnboardingChat(): Promise<{ chatId: string }> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();
  const profile = await getOrCreateBrandProfile();

  const [created] = await db
    .insert(brandProfileChats)
    .values({
      profileId: profile.id,
      workspaceId: workspace.id,
      kind: "onboarding",
      title: "Brand onboarding",
      status: "active",
      axis: "voice",
      turnsRemaining: ONBOARDING_TURNS,
      createdByUserId: userId,
    })
    .returning({ id: brandProfileChats.id });

  return { chatId: created.id };
}

/**
 * Append the marketer's message + the agent's reply + apply any captured
 * structured patch to the profile. Triggers a manual_save revision when the
 * agent returns a non-null capturedPatch.
 *
 * If `pastedSamples` is non-empty, we run `runVoiceAnalyzer` per-locale and
 * fold the result into `brand_profile.voice[locale]` AS WELL AS write a
 * sibling `brand_voices` row so the legacy copywriter/localizer agents keep
 * reading a usable voice. The parallel write is intentional and called out
 * inline.
 */
export async function sendOnboardingTurn(input: unknown): Promise<{
  assistantMessage: string;
  structuredPatch: Record<string, unknown> | null;
  axisNext: ConversationalistAxis;
  turnsRemaining: number;
  profileUpdated: boolean;
}> {
  const parsed = SendOnboardingTurnSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const chat = await db.query.brandProfileChats.findFirst({
    where: and(
      eq(brandProfileChats.id, parsed.chatId),
      eq(brandProfileChats.workspaceId, workspace.id),
    ),
  });
  if (!chat) throw new Error("CHAT_NOT_FOUND");
  if (chat.status !== "active") throw new Error("CHAT_NOT_ACTIVE");

  const profile = await db.query.brandProfiles.findFirst({
    where: eq(brandProfiles.id, chat.profileId),
  });
  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  // Persist the user's message FIRST so it shows on re-open even if the
  // assistant call fails downstream.
  await db.insert(brandProfileChatMessages).values({
    chatId: chat.id,
    workspaceId: workspace.id,
    role: "user",
    content: parsed.userMessage,
  });

  // Voice-analyzer side-channel: when samples were pasted, run the analyzer
  // per-locale BEFORE the conversationalist turn so the agent's draft view
  // already reflects the freshly-extracted voice. Skip on errors — the chat
  // continues even if the analyzer trips up.
  let voiceAnalyzerUsed = false;
  let profileForTurn = profile;
  if (parsed.pastedSamples && parsed.pastedSamples.length > 0) {
    const byLocale = new Map<Locale, { content: string; locale: Locale }[]>();
    for (const s of parsed.pastedSamples) {
      const arr = byLocale.get(s.locale) ?? [];
      arr.push({ content: s.content, locale: s.locale });
      byLocale.set(s.locale, arr);
    }

    const nextVoice: typeof profile.voice = { ...profile.voice };
    for (const [locale, samples] of byLocale) {
      try {
        const result = await runVoiceAnalyzer(
          {
            name: profile.name,
            samples: samples.map((s) => ({
              content: s.content,
              locale: s.locale,
            })),
          },
          { workspaceId: workspace.id, userId },
        );
        const variant = voiceCardToVariant(result.output);
        nextVoice[locale] = variant;
        voiceAnalyzerUsed = true;

        // PARALLEL WRITE: also seed a brand_voices row so legacy
        // copywriter/localizer agents (which currently read from that
        // table) keep working. Temporary until those agents migrate to
        // read from brand_profile in a future session.
        await db.insert(brandVoices).values({
          workspaceId: workspace.id,
          name: `${profile.name} — ${locale} (from samples)`,
          description: "Auto-imported from brand profile onboarding.",
          status: "active",
          defaultLocale: locale,
          toneDescriptors: result.output.tone_descriptors,
          voicePersona: result.output.voice_persona,
          audience: result.output.audience,
          readingLevel: result.output.reading_level,
          dos: result.output.dos,
          donts: result.output.donts,
          requiredWords: result.output.required_words,
          forbiddenWords: result.output.forbidden_words,
          signaturePhrases: result.output.signature_phrases,
          rationale: result.output.rationale,
          analyzerModelId: result.modelId,
          analyzedAt: new Date(),
          createdByUserId: userId,
        });
      } catch (err) {
        console.warn(
          `[brand-profile] voice-analyzer failed for locale=${locale}:`,
          err,
        );
      }
    }
    if (voiceAnalyzerUsed) {
      const [updated] = await db
        .update(brandProfiles)
        .set({ voice: nextVoice, updatedAt: new Date() })
        .where(eq(brandProfiles.id, profile.id))
        .returning();
      profileForTurn = updated;
      await writeRevision({
        profile: updated,
        workspaceId: workspace.id,
        userId,
        revisionType: "voice_analyzer",
        note: `Voice analyzer applied to locales: ${Array.from(byLocale.keys()).join(", ")}`,
      });
    }
  }

  const messages = await loadChatMessages(chat.id, workspace.id);
  const currentAxis = (chat.axis ?? "voice") as ConversationalistAxis;
  const turnsInAxis = countTurnsInAxis(messages, currentAxis);

  const turn = await runBrandProfileConversationalist(
    {
      draft: profileForTurn,
      messages: toConversationalistMessages(messages),
      currentAxis,
      turnsRemaining: chat.turnsRemaining,
      turnsInAxis,
      samplesProvided: voiceAnalyzerUsed,
    },
    { workspaceId: workspace.id, userId },
  );

  const capturedPatch = turn.output.capturedPatch;
  const nextTurnsRemaining = Math.max(0, chat.turnsRemaining - 1);

  // Persist the assistant turn + axis marker for re-open replay.
  await db.insert(brandProfileChatMessages).values({
    chatId: chat.id,
    workspaceId: workspace.id,
    role: "assistant",
    content: turn.output.question,
    structuredPatch: capturedPatch
      ? { ...capturedPatch, _axisAtTurn: turn.output.axisNext }
      : { _axisAtTurn: turn.output.axisNext },
    modelId: turn.modelId,
    provider: turn.provider,
    inputTokens: turn.usage?.inputTokens ?? null,
    outputTokens: turn.usage?.outputTokens ?? null,
    durationMs: turn.durationMs,
  });

  await db
    .update(brandProfileChats)
    .set({
      axis: turn.output.axisNext,
      turnsRemaining: nextTurnsRemaining,
      lastTurnAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(brandProfileChats.id, chat.id));

  let profileUpdated = voiceAnalyzerUsed;
  if (capturedPatch) {
    const folded = foldPatchesIntoDraft(profileForTurn, [capturedPatch]);
    const [updated] = await db
      .update(brandProfiles)
      .set({
        // jsonb-shaped fields — apply selectively from the folded draft.
        name: typeof folded.name === "string" ? folded.name : profileForTurn.name,
        tagline:
          typeof folded.tagline === "string" || folded.tagline === null
            ? (folded.tagline ?? null)
            : profileForTurn.tagline,
        mission:
          typeof folded.mission === "string" || folded.mission === null
            ? (folded.mission ?? null)
            : profileForTurn.mission,
        values: Array.isArray(folded.values) ? folded.values : profileForTurn.values,
        locales: Array.isArray(folded.locales)
          ? (folded.locales as Locale[])
          : profileForTurn.locales,
        voice: folded.voice ?? profileForTurn.voice,
        knowledge: folded.knowledge ?? profileForTurn.knowledge,
        audiences: folded.audiences ?? profileForTurn.audiences,
        positioning: folded.positioning ?? profileForTurn.positioning,
        competitors: Array.isArray(folded.competitors)
          ? folded.competitors
          : profileForTurn.competitors,
        updatedAt: new Date(),
      })
      .where(eq(brandProfiles.id, profileForTurn.id))
      .returning();
    profileUpdated = true;
    await writeRevision({
      profile: updated,
      workspaceId: workspace.id,
      userId,
      revisionType: "manual_save",
      note: `Onboarding chat turn folded ${Object.keys(capturedPatch).join(", ")}`,
    });
  }

  revalidatePath(`/brand-profile/chats/${chat.id}`);
  return {
    assistantMessage: turn.output.question,
    structuredPatch: capturedPatch,
    axisNext: turn.output.axisNext,
    turnsRemaining: nextTurnsRemaining,
    profileUpdated,
  };
}

export async function completeOnboarding(chatId: string): Promise<void> {
  const parsedChatId = ChatIdSchema.parse(chatId);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const chat = await db.query.brandProfileChats.findFirst({
    where: and(
      eq(brandProfileChats.id, parsedChatId),
      eq(brandProfileChats.workspaceId, workspace.id),
    ),
  });
  if (!chat) throw new Error("CHAT_NOT_FOUND");

  await db
    .update(brandProfileChats)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(brandProfileChats.id, chat.id));

  const [updated] = await db
    .update(brandProfiles)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(brandProfiles.id, chat.profileId))
    .returning();

  await writeRevision({
    profile: updated,
    workspaceId: workspace.id,
    userId,
    revisionType: "manual_save",
    note: "Onboarding marked complete.",
  });

  revalidatePath("/brand-profile");
}

/* -------------------------------------------------------------------------- */
/* Extractor path                                                             */
/* -------------------------------------------------------------------------- */

export async function startExtractor(input: unknown): Promise<{
  crawlId: string;
  status: "pending" | "ready" | "failed";
}> {
  const parsed = StartExtractorSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  // Insert the pending crawl row up-front so the UI can show a spinner.
  // Crawl rows are unique on (workspace, url, jsRendered) — when the
  // marketer kicks off the same URL twice, we update the existing row in
  // place instead of inserting (and creating a unique-constraint clash).
  const existing = await db.query.brandProfileCrawls.findFirst({
    where: and(
      eq(brandProfileCrawls.workspaceId, workspace.id),
      eq(brandProfileCrawls.url, parsed.url),
      eq(brandProfileCrawls.jsRendered, parsed.jsRendered ?? false),
    ),
  });

  let crawlId: string;
  if (existing) {
    const [updated] = await db
      .update(brandProfileCrawls)
      .set({
        status: "pending",
        cookieProfileId: parsed.cookieProfileId ?? null,
        error: null,
        crawledAt: null,
        expiresAt: null,
      })
      .where(eq(brandProfileCrawls.id, existing.id))
      .returning({ id: brandProfileCrawls.id });
    crawlId = updated.id;
  } else {
    const [created] = await db
      .insert(brandProfileCrawls)
      .values({
        workspaceId: workspace.id,
        url: parsed.url,
        status: "pending",
        jsRendered: parsed.jsRendered ?? false,
        cookieProfileId: parsed.cookieProfileId ?? null,
        createdByUserId: userId,
      })
      .returning({ id: brandProfileCrawls.id });
    crawlId = created.id;
  }

  // Kick off the real crawl. Worktree B's `crawlSite` returns a CrawlResult;
  // we persist that result on the crawl row + flip status to "ready".
  // Until B ships, the stub throws and we mark the crawl failed — that's
  // the right surface for the UI: it shows a clear "crawler unavailable"
  // banner instead of silently hanging.
  let crawl: CrawlResult | null = null;
  let crawlError: string | null = null;
  try {
    crawl = await crawlSite(workspace.id, parsed.url, {
      jsRendered: parsed.jsRendered,
      cookieProfileId: parsed.cookieProfileId,
    });
  } catch (err) {
    crawlError = (err as Error).message;
  }

  if (crawl) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day cache
    await db
      .update(brandProfileCrawls)
      .set({
        status: "ready",
        finalUrl: crawl.finalUrl,
        extractedContent: {
          pages: crawl.pages,
          detectedLocales: crawl.detectedLocales,
          sitemapFound: crawl.sitemapFound,
          robotsBlocked: crawl.robotsBlocked,
        },
        crawledAt: new Date(),
        expiresAt,
      })
      .where(eq(brandProfileCrawls.id, crawlId));
    return { crawlId, status: "ready" };
  }

  await db
    .update(brandProfileCrawls)
    .set({
      status: "failed",
      error: crawlError ?? "Crawler returned no result.",
    })
    .where(eq(brandProfileCrawls.id, crawlId));
  return { crawlId, status: "failed" };
}

export async function getCrawlResult(crawlId: string): Promise<BrandProfileCrawl> {
  const parsedId = CrawlIdSchema.parse(crawlId);
  const { workspace } = await getCurrentWorkspace();

  const crawl = await db.query.brandProfileCrawls.findFirst({
    where: and(
      eq(brandProfileCrawls.id, parsedId),
      eq(brandProfileCrawls.workspaceId, workspace.id),
    ),
  });
  if (!crawl) throw new Error("CRAWL_NOT_FOUND");
  return crawl;
}

/**
 * Run the extractor agent on a finished crawl + persist its proposal as the
 * new brand profile. `proposalOverrides` lets the UI apply review-time
 * edits before the marketer accepts.
 */
export async function applyExtractorProposal(input: unknown): Promise<{
  profileId: string;
}> {
  const parsed = ApplyExtractorProposalSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const crawl = await db.query.brandProfileCrawls.findFirst({
    where: and(
      eq(brandProfileCrawls.id, parsed.crawlId),
      eq(brandProfileCrawls.workspaceId, workspace.id),
    ),
  });
  if (!crawl) throw new Error("CRAWL_NOT_FOUND");
  if (crawl.status !== "ready") throw new Error("CRAWL_NOT_READY");
  if (!crawl.extractedContent) throw new Error("CRAWL_HAS_NO_CONTENT");

  const profile = await getOrCreateBrandProfile();

  const crawlResult: CrawlResult = {
    finalUrl: crawl.finalUrl ?? crawl.url,
    pages: crawl.extractedContent.pages,
    detectedLocales: crawl.extractedContent.detectedLocales,
    sitemapFound: crawl.extractedContent.sitemapFound,
    robotsBlocked: crawl.extractedContent.robotsBlocked,
    jsRendered: crawl.jsRendered,
  };

  const extracted = await runBrandProfileExtractor(
    {
      crawl: crawlResult,
      locales: crawl.extractedContent.detectedLocales.length
        ? crawl.extractedContent.detectedLocales
        : profile.locales,
    },
    { workspaceId: workspace.id, userId },
  );

  // Merge: extractor proposal → optional overrides → base. Fields the
  // extractor surfaced replace base; fields the marketer hand-edited via
  // overrides replace the extractor.
  const next: BrandProfile = {
    ...profile,
    name: typeof extracted.output.name === "string" ? extracted.output.name : profile.name,
    tagline:
      typeof extracted.output.tagline === "string" ? extracted.output.tagline : profile.tagline,
    mission:
      typeof extracted.output.mission === "string" ? extracted.output.mission : profile.mission,
    values: extracted.output.values ?? profile.values,
    locales: extracted.output.locales ?? profile.locales,
    voice: { ...profile.voice, ...(extracted.output.voice ?? {}) },
    knowledge: extracted.output.knowledge ?? profile.knowledge,
    audiences: { ...profile.audiences, ...(extracted.output.audiences ?? {}) },
    positioning: extracted.output.positioning ?? profile.positioning,
    competitors: extracted.output.competitors ?? profile.competitors,
  };

  // Apply marketer overrides as a final pass — same dotted-path semantics
  // as the conversationalist's captured patches.
  const merged = parsed.proposalOverrides
    ? foldPatchesIntoDraft(next, [parsed.proposalOverrides as Record<string, unknown>])
    : next;

  const [updated] = await db
    .update(brandProfiles)
    .set({
      name: merged.name ?? next.name,
      tagline: merged.tagline ?? next.tagline,
      mission: merged.mission ?? next.mission,
      values: merged.values ?? next.values,
      locales: merged.locales ?? next.locales,
      voice: merged.voice ?? next.voice,
      knowledge: merged.knowledge ?? next.knowledge,
      audiences: merged.audiences ?? next.audiences,
      positioning: merged.positioning ?? next.positioning,
      competitors: merged.competitors ?? next.competitors,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.id, profile.id))
    .returning();

  await writeRevision({
    profile: updated,
    workspaceId: workspace.id,
    userId,
    revisionType: "crawl_extract",
    note: `Extracted from ${crawl.finalUrl ?? crawl.url}.`,
  });

  revalidatePath("/brand-profile");
  return { profileId: updated.id };
}

/* -------------------------------------------------------------------------- */
/* Re-open chat (Mode A)                                                      */
/* -------------------------------------------------------------------------- */

export async function reopenChat(chatId: string): Promise<{
  messages: BrandProfileChatMessage[];
}> {
  const parsedId = ChatIdSchema.parse(chatId);
  const { workspace } = await getCurrentWorkspace();

  const chat = await db.query.brandProfileChats.findFirst({
    where: and(
      eq(brandProfileChats.id, parsedId),
      eq(brandProfileChats.workspaceId, workspace.id),
    ),
  });
  if (!chat) throw new Error("CHAT_NOT_FOUND");

  // If the chat had been marked completed, flipping back to active keeps
  // the marketer's intent visible. Phase 1C's UI shows a "this chat is
  // continued" badge.
  if (chat.status === "completed") {
    await db
      .update(brandProfileChats)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(brandProfileChats.id, chat.id));
  }

  const messages = await loadChatMessages(chat.id, workspace.id);
  return { messages };
}

/* -------------------------------------------------------------------------- */
/* NL command (Mode B)                                                        */
/* -------------------------------------------------------------------------- */

export async function runNlCommand(input: unknown): Promise<{
  summary: string;
  diff: PatchDiffEntry[];
  applied: boolean;
}> {
  const parsed = NlCommandSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const profile = await getOrCreateBrandProfile();

  let patch: NlCommandPatch;
  try {
    const result = await runAgent(
      brandProfileEditor,
      { profile, command: parsed.command },
      { workspaceId: workspace.id, userId },
    );
    patch = result.output;
  } catch (err) {
    throw new Error(`NL command interpretation failed: ${(err as Error).message}`);
  }

  if (patch.changes.length === 0) {
    return { summary: patch.summary, diff: [], applied: false };
  }

  const { profile: next, diff } = applyNlPatch(profile, patch.changes);

  // Coerce next into the row shape we can update.
  const [updated] = await db
    .update(brandProfiles)
    .set({
      name: next.name,
      tagline: next.tagline ?? null,
      mission: next.mission ?? null,
      values: next.values ?? [],
      locales: next.locales ?? ["en"],
      voice: next.voice ?? {},
      knowledge: next.knowledge ?? EMPTY_KNOWLEDGE,
      audiences: next.audiences ?? {},
      positioning: next.positioning ?? EMPTY_POSITIONING,
      competitors: next.competitors ?? [],
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.id, profile.id))
    .returning();

  await writeRevision({
    profile: updated,
    workspaceId: workspace.id,
    userId,
    revisionType: "nl_command",
    note: `NL command: ${parsed.command.slice(0, 200)}`,
  });

  revalidatePath("/brand-profile");
  return { summary: patch.summary, diff, applied: true };
}

/* -------------------------------------------------------------------------- */
/* Versioning                                                                 */
/* -------------------------------------------------------------------------- */

export async function listRevisions(): Promise<BrandProfileRevision[]> {
  const { workspace } = await getCurrentWorkspace();
  const profile = await getOrCreateBrandProfile();

  // Full rows including the snapshot jsonb. The roll-back UI needs the
  // snapshot to render a confirm-dialog preview; an earlier iteration
  // trimmed `snapshot` for payload size but the V1 list view is capped at
  // 100 rows per workspace and snapshots are ~50 KB each, so the trim
  // wasn't load-bearing.
  return db.query.brandProfileRevisions.findMany({
    where: and(
      eq(brandProfileRevisions.profileId, profile.id),
      eq(brandProfileRevisions.workspaceId, workspace.id),
    ),
    orderBy: [desc(brandProfileRevisions.createdAt)],
    limit: 100,
  });
}

/**
 * Lighter read for the brand-profile page and settings: returns the
 * existing profile or null. Doesn't create one (the dashboard
 * auto-trigger already nudges into onboarding when null). Kept as a
 * sibling to `getOrCreateBrandProfile` so callers can pick the
 * "create-if-missing vs. null" semantics they want.
 */
export async function getBrandProfile(): Promise<BrandProfile | null> {
  const { workspace } = await getCurrentWorkspace();
  const row = await db.query.brandProfiles.findFirst({
    where: eq(brandProfiles.workspaceId, workspace.id),
  });
  return row ?? null;
}

const UpdateLocalesSchema = z
  .array(z.enum(localeEnum.enumValues))
  .min(1)
  .max(4);

/**
 * Settings → Brand profile: marketer updates which locales their brand
 * operates in. Writes a `manual_save` revision so the change is
 * roll-back-able. Locales already configured with voice/audience entries
 * are preserved; new locales come up empty (the deep-dive chat fills
 * them later).
 */
export async function updateBrandLocales(
  locales: Locale[],
): Promise<{ ok: true }> {
  const parsed = UpdateLocalesSchema.parse(locales);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const profile = await getOrCreateBrandProfile();
  const updated = await db
    .update(brandProfiles)
    .set({ locales: parsed, updatedAt: new Date() })
    .where(eq(brandProfiles.id, profile.id))
    .returning();

  if (updated[0]) {
    await db.insert(brandProfileRevisions).values({
      profileId: profile.id,
      workspaceId: workspace.id,
      snapshot: updated[0],
      revisionType: "manual_save",
      note: `Locales set to: ${parsed.join(", ")}`,
      createdByUserId: userId,
    });
  }

  revalidatePath("/brand-profile");
  revalidatePath("/settings/brand-profile");
  return { ok: true };
}

export async function rollBackTo(revisionId: string): Promise<void> {
  const parsedId = RevisionIdSchema.parse(revisionId);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const revision = await db.query.brandProfileRevisions.findFirst({
    where: and(
      eq(brandProfileRevisions.id, parsedId),
      eq(brandProfileRevisions.workspaceId, workspace.id),
    ),
  });
  if (!revision) throw new Error("REVISION_NOT_FOUND");
  if (!revision.snapshot) throw new Error("REVISION_HAS_NO_SNAPSHOT");

  // Write the snapshot back into the profile row, then record a NEW
  // "roll_back" revision so the history never goes backward in time. The
  // rolled-back snapshot becomes the latest revision.
  const snap = revision.snapshot;
  const [updated] = await db
    .update(brandProfiles)
    .set({
      name: snap.name,
      tagline: snap.tagline ?? null,
      mission: snap.mission ?? null,
      values: snap.values ?? [],
      locales: snap.locales ?? ["en"],
      voice: snap.voice ?? {},
      knowledge: snap.knowledge ?? EMPTY_KNOWLEDGE,
      audiences: snap.audiences ?? {},
      positioning: snap.positioning ?? EMPTY_POSITIONING,
      competitors: snap.competitors ?? [],
      onboardingComplete: snap.onboardingComplete ?? false,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.id, revision.profileId))
    .returning();

  await writeRevision({
    profile: updated,
    workspaceId: workspace.id,
    userId,
    revisionType: "roll_back",
    note: `Rolled back to revision ${revision.id} (${revision.revisionType}).`,
  });

  revalidatePath("/brand-profile");
}

/* -------------------------------------------------------------------------- */
/* Deep-dives                                                                 */
/* -------------------------------------------------------------------------- */

export async function startDeepDive(input: unknown): Promise<{
  chatId: string;
}> {
  const parsed = StartDeepDiveSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();
  const profile = await getOrCreateBrandProfile();

  if (parsed.kind === "localizer_deep_dive" && !parsed.locale) {
    throw new Error("LOCALE_REQUIRED_FOR_LOCALIZER_DEEP_DIVE");
  }

  const title =
    parsed.kind === "seo_deep_dive"
      ? "SEO deep-dive"
      : `Localizer deep-dive (${parsed.locale})`;

  const [created] = await db
    .insert(brandProfileChats)
    .values({
      profileId: profile.id,
      workspaceId: workspace.id,
      kind: parsed.kind as BrandProfileChatKind,
      title,
      status: "active",
      axis: parsed.kind === "seo_deep_dive" ? "seo" : "localizer",
      locale: parsed.locale ?? null,
      turnsRemaining: DEEP_DIVE_TURNS,
      createdByUserId: userId,
    })
    .returning({ id: brandProfileChats.id });

  return { chatId: created.id };
}

export async function sendDeepDiveTurn(input: unknown): Promise<{
  assistantMessage: string;
  complete: boolean;
}> {
  const parsed = SendDeepDiveTurnSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const chat = await db.query.brandProfileChats.findFirst({
    where: and(
      eq(brandProfileChats.id, parsed.chatId),
      eq(brandProfileChats.workspaceId, workspace.id),
    ),
  });
  if (!chat) throw new Error("CHAT_NOT_FOUND");
  if (chat.status !== "active") throw new Error("CHAT_NOT_ACTIVE");
  if (chat.kind !== "seo_deep_dive" && chat.kind !== "localizer_deep_dive") {
    throw new Error("CHAT_IS_NOT_DEEP_DIVE");
  }

  const profile = await db.query.brandProfiles.findFirst({
    where: eq(brandProfiles.id, chat.profileId),
  });
  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  await db.insert(brandProfileChatMessages).values({
    chatId: chat.id,
    workspaceId: workspace.id,
    role: "user",
    content: parsed.userMessage,
  });

  const messages = await loadChatMessages(chat.id, workspace.id);
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  let turnResult: {
    output: { question: string; complete: boolean };
    modelId: string;
    provider: string;
    durationMs: number;
    usage?: { inputTokens?: number; outputTokens?: number };
  };
  if (chat.kind === "seo_deep_dive") {
    turnResult = await runBrandProfileSeoDeepDive(
      { profile, messages: history, turnsRemaining: chat.turnsRemaining },
      { workspaceId: workspace.id, userId },
    );
  } else {
    if (!chat.locale) throw new Error("LOCALIZER_DEEP_DIVE_MISSING_LOCALE");
    turnResult = await runBrandProfileLocalizerDeepDive(
      {
        profile,
        locale: chat.locale,
        messages: history,
        turnsRemaining: chat.turnsRemaining,
      },
      { workspaceId: workspace.id, userId },
    );
  }

  const nextTurnsRemaining = Math.max(0, chat.turnsRemaining - 1);
  const willComplete = turnResult.output.complete || nextTurnsRemaining === 0;

  await db.insert(brandProfileChatMessages).values({
    chatId: chat.id,
    workspaceId: workspace.id,
    role: "assistant",
    content: turnResult.output.question,
    modelId: turnResult.modelId,
    provider: turnResult.provider,
    inputTokens: turnResult.usage?.inputTokens ?? null,
    outputTokens: turnResult.usage?.outputTokens ?? null,
    durationMs: turnResult.durationMs,
  });

  await db
    .update(brandProfileChats)
    .set({
      turnsRemaining: nextTurnsRemaining,
      status: willComplete ? "completed" : "active",
      lastTurnAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(brandProfileChats.id, chat.id));

  if (willComplete) {
    // V1 stance: transcript-only persistence. Recording the deep-dive's
    // completion in the revision log is still useful — the marketer can see
    // "I ran an SEO deep-dive on May 26 and it's available to re-open from
    // the SEO settings entry point". The brand profile itself is unchanged.
    await writeRevision({
      profile,
      workspaceId: workspace.id,
      userId,
      revisionType: "deep_dive_save",
      note: `${chat.kind} chat completed; transcript at chat=${chat.id}.`,
    });
  }

  revalidatePath(`/brand-profile/chats/${chat.id}`);
  return {
    assistantMessage: turnResult.output.question,
    complete: willComplete,
  };
}

/* -------------------------------------------------------------------------- */
/* BYOK cookie store                                                          */
/* -------------------------------------------------------------------------- */

export async function saveCookieProfile(input: unknown): Promise<{ id: string }> {
  const parsed = SaveCookieProfileSchema.parse(input);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");
  const userId = await requireUserId();

  const ciphertext = encryptSecret(parsed.cookieValue);
  const last4 =
    parsed.cookieValue.length <= 4
      ? "*".repeat(parsed.cookieValue.length)
      : parsed.cookieValue.slice(-4);

  const [created] = await db
    .insert(brandProfileCookies)
    .values({
      workspaceId: workspace.id,
      domain: parsed.domain,
      label: parsed.label,
      ciphertext,
      last4,
      createdByUserId: userId,
    })
    .returning({ id: brandProfileCookies.id });

  revalidatePath("/brand-profile/cookies");
  return { id: created.id };
}

export async function listCookieProfiles(): Promise<
  Array<{ id: string; domain: string; label: string; last4: string }>
> {
  const { workspace } = await getCurrentWorkspace();
  const rows = await db.query.brandProfileCookies.findMany({
    where: eq(brandProfileCookies.workspaceId, workspace.id),
    orderBy: [desc(brandProfileCookies.createdAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    label: r.label,
    last4: r.last4,
  }));
}

export async function deleteCookieProfile(id: string): Promise<void> {
  const parsedId = CookieIdSchema.parse(id);
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "editor");

  await db
    .delete(brandProfileCookies)
    .where(
      and(
        eq(brandProfileCookies.id, parsedId),
        eq(brandProfileCookies.workspaceId, workspace.id),
      ),
    );
  revalidatePath("/brand-profile/cookies");
}

/* -------------------------------------------------------------------------- */
/* Note: client code that needs these schema types should import them         */
/* directly from "@/db/schema" — Next.js' "use server" directive forbids      */
/* non-async exports.                                                          */
/* -------------------------------------------------------------------------- */
