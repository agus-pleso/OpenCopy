import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  primaryKey,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  boolean,
  vector,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import { relations } from "drizzle-orm";

/* ----------------------------------------------------------------------------
 * Enums
 * -------------------------------------------------------------------------- */

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

/** Locales supported by the platform. CEE focus per product scope. */
export const localeEnum = pgEnum("locale", ["en", "pl", "ro", "uk"]);

export const apiKeyProviderEnum = pgEnum("api_key_provider", [
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "mistral",
  "ollama",
]);

export const modelRoleEnum = pgEnum("model_role", [
  "planning",
  "drafting",
  "fast",
  "critic",
]);

/* ----------------------------------------------------------------------------
 * Auth.js core tables (users / accounts / sessions / verificationTokens)
 * Schema matches @auth/drizzle-adapter expectations.
 * -------------------------------------------------------------------------- */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/** Auth.js credentials provider (dev only) — stores hashed password for the
 *  dev sign-in flow. Disable in production via DEV_AUTH_ENABLED=false. */
export const credentials = pgTable("credentials", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Multi-tenant: workspaces + memberships
 * Every domain resource carries `workspace_id`. UI for inviting/managing teams
 * lands post-V1.0, but the data model and access layer enforce scoping today.
 * -------------------------------------------------------------------------- */

export const workspaces = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultLocale: localeEnum("default_locale").notNull().default("en"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const members = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_workspace_user_unique").on(t.workspaceId, t.userId),
    index("members_user_idx").on(t.userId),
  ],
);

/** Per-user UI / app preferences. Holds the "current workspace" for session
 *  continuity across sign-ins. */
export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  currentWorkspaceId: uuid("current_workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  theme: text("theme").default("system"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * AI provider keys (encrypted at rest with server master key)
 * -------------------------------------------------------------------------- */

export const apiKeys = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: apiKeyProviderEnum("provider").notNull(),
    /** AES-256-GCM ciphertext (base64). See lib/crypto.ts. */
    ciphertext: text("ciphertext").notNull(),
    /** Last 4 chars of the plaintext key, for UI display. */
    last4: text("last4").notNull(),
    /** Optional base URL override (Ollama, self-hosted gateways). */
    baseUrl: text("base_url"),
    label: text("label"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_workspace_provider_unique").on(t.workspaceId, t.provider),
  ],
);

/** Workspace-scoped default model picks per role (planning/drafting/fast/critic). */
export const modelDefaults = pgTable(
  "model_default",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: modelRoleEnum("role").notNull(),
    /** OpenRouter-style id, e.g. "anthropic/claude-sonnet-4.6". */
    modelId: text("model_id").notNull(),
    /** Which provider to route through (defaults to "openrouter"). */
    provider: apiKeyProviderEnum("provider").notNull().default("openrouter"),
    /** Free-form per-role overrides (e.g. temperature, max tokens). */
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.role] })],
);

/* ----------------------------------------------------------------------------
 * Relations (for Drizzle's relational queries)
 * -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  members: many(members),
  prefs: one(userPrefs, {
    fields: [users.id],
    references: [userPrefs.userId],
  }),
  credentials: one(credentials, {
    fields: [users.id],
    references: [credentials.userId],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  members: many(members),
  apiKeys: many(apiKeys),
  modelDefaults: many(modelDefaults),
  createdBy: one(users, {
    fields: [workspaces.createdByUserId],
    references: [users.id],
  }),
}));

export const membersRelations = relations(members, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [members.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [apiKeys.createdByUserId],
    references: [users.id],
  }),
}));

export const modelDefaultsRelations = relations(modelDefaults, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [modelDefaults.workspaceId],
    references: [workspaces.id],
  }),
}));

export const userPrefsRelations = relations(userPrefs, ({ one }) => ({
  user: one(users, { fields: [userPrefs.userId], references: [users.id] }),
  currentWorkspace: one(workspaces, {
    fields: [userPrefs.currentWorkspaceId],
    references: [workspaces.id],
  }),
}));

/* ----------------------------------------------------------------------------
 * Inferred types
 * -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Member = typeof members.$inferSelect;
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type Locale = (typeof localeEnum.enumValues)[number];
export type ApiKeyProvider = (typeof apiKeyProviderEnum.enumValues)[number];
export type ModelRole = (typeof modelRoleEnum.enumValues)[number];
export type ApiKey = typeof apiKeys.$inferSelect;
export type ModelDefault = typeof modelDefaults.$inferSelect;

/* ----------------------------------------------------------------------------
 * Brand voices — the spine that every agent reads from.
 * V0.2 introduces the primitive; Copywriter and Localizer agents in V1.0
 * inject the structured voice card into their system prompts.
 * -------------------------------------------------------------------------- */

export const voiceStatusEnum = pgEnum("voice_status", [
  "draft",
  "active",
  "archived",
]);

/** Severity of issues raised by the Voice Auditor. */
export const auditSeverityEnum = pgEnum("audit_severity", [
  "low",
  "medium",
  "high",
]);

export interface VoiceCardRule {
  rule: string;
  why?: string;
}

export interface VoiceCardLocaleNotes {
  pl?: string;
  en?: string;
  ro?: string;
  uk?: string;
}

export const brandVoices = pgTable(
  "brand_voice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: voiceStatusEnum("status").notNull().default("draft"),
    defaultLocale: localeEnum("default_locale").notNull().default("en"),

    // Structured voice card — populated by the Voice Analyzer agent, editable by user.
    toneDescriptors: jsonb("tone_descriptors")
      .$type<string[]>()
      .notNull()
      .default([]),
    voicePersona: text("voice_persona"),
    audience: text("audience"),
    readingLevel: text("reading_level"),
    dos: jsonb("dos").$type<VoiceCardRule[]>().notNull().default([]),
    donts: jsonb("donts").$type<VoiceCardRule[]>().notNull().default([]),
    requiredWords: jsonb("required_words")
      .$type<string[]>()
      .notNull()
      .default([]),
    forbiddenWords: jsonb("forbidden_words")
      .$type<string[]>()
      .notNull()
      .default([]),
    localeNotes: jsonb("locale_notes")
      .$type<VoiceCardLocaleNotes>()
      .notNull()
      .default({}),
    rationale: text("rationale"),

    // Provenance
    analyzerModelId: text("analyzer_model_id"),
    analyzedAt: timestamp("analyzed_at", { mode: "date" }),

    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("brand_voice_workspace_idx").on(t.workspaceId),
    index("brand_voice_status_idx").on(t.workspaceId, t.status),
  ],
);

export const voiceSamples = pgTable(
  "voice_sample",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voiceId: uuid("voice_id")
      .notNull()
      .references(() => brandVoices.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceLabel: text("source_label"),
    locale: localeEnum("locale").notNull().default("en"),
    content: text("content").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("voice_sample_voice_idx").on(t.voiceId)],
);

export interface VoiceAuditIssue {
  excerpt: string;
  category:
    | "tone"
    | "do_violation"
    | "dont_violation"
    | "forbidden_word"
    | "missing_required"
    | "reading_level"
    | "audience_mismatch"
    | "other";
  severity: "low" | "medium" | "high";
  explanation: string;
  suggestion?: string;
}

/** Optional history of audit playground runs. Useful for showing "you've used
 *  this voice 47 times" in workspace stats later. */
export const voiceAudits = pgTable(
  "voice_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voiceId: uuid("voice_id")
      .notNull()
      .references(() => brandVoices.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    draftText: text("draft_text").notNull(),
    overallScore: integer("overall_score").notNull(),
    summary: text("summary"),
    strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
    issues: jsonb("issues").$type<VoiceAuditIssue[]>().notNull().default([]),
    modelId: text("model_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("voice_audit_voice_idx").on(t.voiceId)],
);

export const brandVoicesRelations = relations(brandVoices, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [brandVoices.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [brandVoices.createdByUserId],
    references: [users.id],
  }),
  samples: many(voiceSamples),
  audits: many(voiceAudits),
}));

export const voiceSamplesRelations = relations(voiceSamples, ({ one }) => ({
  voice: one(brandVoices, {
    fields: [voiceSamples.voiceId],
    references: [brandVoices.id],
  }),
}));

export const voiceAuditsRelations = relations(voiceAudits, ({ one }) => ({
  voice: one(brandVoices, {
    fields: [voiceAudits.voiceId],
    references: [brandVoices.id],
  }),
}));

export type BrandVoice = typeof brandVoices.$inferSelect;
export type VoiceSample = typeof voiceSamples.$inferSelect;
export type VoiceAudit = typeof voiceAudits.$inferSelect;
export type VoiceStatus = (typeof voiceStatusEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Agent runs (V1.0) — Copywriter + Localizer multi-agent orchestrations.
 * Every run has many steps (one per agent invocation in the flow). Approved
 * outputs land in `copy_variants` (the workspace library).
 * -------------------------------------------------------------------------- */

export const agentKindEnum = pgEnum("agent_kind", [
  "copywriter",
  "localizer",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const agentStepStatusEnum = pgEnum("agent_step_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const variantStatusEnum = pgEnum("variant_status", [
  "draft",
  "saved",
  "discarded",
]);

/** Channel hint for copywriter briefs. Affects format expectations only. */
export const channelEnum = pgEnum("channel", [
  "ad",
  "email",
  "landing",
  "social",
  "blog",
  "headline",
  "product_description",
  "other",
]);

export interface CopywriterBrief {
  voiceId: string;
  channel: (typeof channelEnum.enumValues)[number];
  locale: (typeof localeEnum.enumValues)[number];
  objective: string;
  audienceOverride?: string;
  productInfo?: string;
  length?: string;
  variantCount: number;
  keywords?: string[];
  forbiddenTerms?: string[];
  examples?: string;
  /** Knowledge-base source ids to consult during planning + drafting. */
  sourceIds?: string[];
}

export interface LocalizerBrief {
  voiceId?: string;
  sourceLocale: (typeof localeEnum.enumValues)[number];
  targetLocale: (typeof localeEnum.enumValues)[number];
  sourceText: string;
  /** Optional original-context hint (channel, audience). */
  contextHint?: string;
}

export const agentRuns = pgTable(
  "agent_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: agentKindEnum("kind").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    /** Parsed brief (jsonb). Shape depends on `kind`. */
    brief: jsonb("brief").$type<CopywriterBrief | LocalizerBrief>().notNull(),
    /** Failure message if status=failed. */
    error: text("error"),
    /** Total wall-clock duration in ms (when finished). */
    durationMs: integer("duration_ms"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
  },
  (t) => [
    index("agent_run_workspace_idx").on(t.workspaceId, t.createdAt),
    index("agent_run_voice_idx").on(t.voiceId),
    index("agent_run_kind_status_idx").on(t.kind, t.status),
  ],
);

export const agentRunSteps = pgTable(
  "agent_run_step",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    /** Order within the run, 0-indexed. */
    seq: integer("seq").notNull(),
    /** Stable agent name from AgentDef (e.g. "copywriter-planner"). */
    agentName: text("agent_name").notNull(),
    status: agentStepStatusEnum("status").notNull().default("pending"),
    modelId: text("model_id"),
    provider: text("provider"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    startedAt: timestamp("started_at", { mode: "date" }),
    finishedAt: timestamp("finished_at", { mode: "date" }),
  },
  (t) => [index("agent_run_step_run_idx").on(t.runId, t.seq)],
);

/** A single piece of copy produced by a copywriter or localizer run. */
export const copyVariants = pgTable(
  "copy_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull().default("en"),
    /** Variant ordinal within the run (0-indexed). */
    seq: integer("seq").notNull(),
    /** Optional label / angle name (e.g. "Direct: lead with the price"). */
    label: text("label"),
    /** Strategy/angle the planner picked, in plain text. */
    strategy: text("strategy"),
    content: text("content").notNull(),
    /** Voice audit score for this variant (0-100). */
    auditScore: integer("audit_score"),
    auditSummary: text("audit_summary"),
    auditIssues: jsonb("audit_issues").$type<VoiceAuditIssue[]>().default([]).notNull(),
    auditStrengths: jsonb("audit_strengths").$type<string[]>().default([]).notNull(),
    /** Optional refined version after a Refine pass. */
    refinedContent: text("refined_content"),
    refinedScore: integer("refined_score"),
    /** For Localizer outputs only — back-translation to source for sanity check. */
    backTranslation: text("back_translation"),
    /** Cultural-adapter notes (idioms, references, formality calls). */
    culturalNotes: jsonb("cultural_notes").$type<
      Array<{ excerpt: string; note: string }>
    >().default([]).notNull(),
    status: variantStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    savedAt: timestamp("saved_at", { mode: "date" }),
  },
  (t) => [
    index("copy_variant_workspace_idx").on(t.workspaceId, t.status, t.createdAt),
    index("copy_variant_run_idx").on(t.runId, t.seq),
    index("copy_variant_voice_idx").on(t.voiceId),
  ],
);

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [agentRuns.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [agentRuns.voiceId],
    references: [brandVoices.id],
  }),
  createdBy: one(users, {
    fields: [agentRuns.createdByUserId],
    references: [users.id],
  }),
  steps: many(agentRunSteps),
  variants: many(copyVariants),
}));

export const agentRunStepsRelations = relations(agentRunSteps, ({ one }) => ({
  run: one(agentRuns, {
    fields: [agentRunSteps.runId],
    references: [agentRuns.id],
  }),
}));

export const copyVariantsRelations = relations(copyVariants, ({ one }) => ({
  run: one(agentRuns, {
    fields: [copyVariants.runId],
    references: [agentRuns.id],
  }),
  workspace: one(workspaces, {
    fields: [copyVariants.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [copyVariants.voiceId],
    references: [brandVoices.id],
  }),
}));

export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type CopyVariant = typeof copyVariants.$inferSelect;
export type AgentKind = (typeof agentKindEnum.enumValues)[number];
export type AgentRunStatus = (typeof agentRunStatusEnum.enumValues)[number];
export type AgentStepStatus = (typeof agentStepStatusEnum.enumValues)[number];
export type VariantStatus = (typeof variantStatusEnum.enumValues)[number];
export type Channel = (typeof channelEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Documents (V1.1) — long-form writing surface with inline AI commands.
 * Tiptap editor on top, brand-voice-aware slash commands underneath.
 * -------------------------------------------------------------------------- */

export const documentStatusEnum = pgEnum("document_status", [
  "draft",
  "published",
  "archived",
]);

export const documents = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    /** Tiptap-serialized HTML. */
    contentHtml: text("content_html").notNull().default(""),
    /** Plain-text projection for word/char counting and future search. */
    contentText: text("content_text").notNull().default(""),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull().default("en"),
    status: documentStatusEnum("status").notNull().default("draft"),
    wordCount: integer("word_count").notNull().default(0),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("document_workspace_idx").on(t.workspaceId, t.updatedAt),
    index("document_voice_idx").on(t.voiceId),
    index("document_status_idx").on(t.workspaceId, t.status),
  ],
);

export const documentsRelations = relations(documents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [documents.voiceId],
    references: [brandVoices.id],
  }),
  createdBy: one(users, {
    fields: [documents.createdByUserId],
    references: [users.id],
  }),
}));

export type Document = typeof documents.$inferSelect;
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Knowledge base (V1.2) — workspace-scoped sources + pgvector chunks.
 * Copywriter, Localizer, and editor commands can pull relevant chunks at
 * generation time so output is grounded in the user's actual product/brand
 * facts, not just the brief.
 * -------------------------------------------------------------------------- */

export const kbSourceStatusEnum = pgEnum("kb_source_status", [
  "indexing",
  "ready",
  "failed",
  "archived",
]);

/** Embedding dimensions are tied to the chosen embedding model.
 *  Default: OpenAI text-embedding-3-small @ 1536 dims.
 *  When V1.5 introduces alternate providers (Voyage, Cohere, local), each
 *  workspace's chunks must use a single model — we'll add a workspace-level
 *  embedding-model column to enforce that. */
export const KB_EMBEDDING_DIMENSIONS = 1536;

export const kbSources = pgTable(
  "kb_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Free-form tags for filtering / multi-select in the copywriter form. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Original source content (markdown / plain text). */
    rawContent: text("raw_content").notNull(),
    status: kbSourceStatusEnum("status").notNull().default("indexing"),
    /** Number of chunks produced by the last indexing pass. */
    chunkCount: integer("chunk_count").notNull().default(0),
    /** Total tokens (estimated) across all chunks. */
    tokenCount: integer("token_count").notNull().default(0),
    /** Embedding model used for this source — guards against mixing models. */
    embeddingModel: text("embedding_model"),
    error: text("error"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    indexedAt: timestamp("indexed_at", { mode: "date" }),
  },
  (t) => [
    index("kb_source_workspace_idx").on(t.workspaceId, t.updatedAt),
    index("kb_source_status_idx").on(t.workspaceId, t.status),
  ],
);

export const kbChunks = pgTable(
  "kb_chunk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => kbSources.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Order within the source. 0-indexed. */
    seq: integer("seq").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    embedding: vector("embedding", {
      dimensions: KB_EMBEDDING_DIMENSIONS,
    }),
    /** Free-form metadata — heading text, page number when PDFs land, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("kb_chunk_source_idx").on(t.sourceId, t.seq),
    index("kb_chunk_workspace_idx").on(t.workspaceId),
  ],
);

export const kbSourcesRelations = relations(kbSources, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [kbSources.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [kbSources.createdByUserId],
    references: [users.id],
  }),
  chunks: many(kbChunks),
}));

export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  source: one(kbSources, {
    fields: [kbChunks.sourceId],
    references: [kbSources.id],
  }),
}));

export type KbSource = typeof kbSources.$inferSelect;
export type KbChunk = typeof kbChunks.$inferSelect;
export type KbSourceStatus = (typeof kbSourceStatusEnum.enumValues)[number];
