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
 * Every domain resource carries `workspace_id`. The data model and access
 * layer enforce scoping.
 * -------------------------------------------------------------------------- */

export const workspaces = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultLocale: localeEnum("default_locale").notNull().default("en"),
  /** Embedding provider for the knowledge base. NULL => "openai" (legacy default). */
  embeddingProvider: text("embedding_provider"),
  /** Model id to pass to the chosen embedding provider. */
  embeddingModel: text("embedding_model"),
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
/** Per-tour completion bits. Keys are stable tour ids
 *  ("first_run" | "voices" | "knowledge" | "campaigns" | "library" |
 *  "documents" | "chat"). The value is `true` once the user has finished
 *  (or explicitly skipped) that tour. Anything missing/false is treated
 *  as "not completed" — first-run tour auto-fires when first_run is unset. */
export type ToursCompleted = Partial<
  Record<
    | "first_run"
    | "voices"
    | "knowledge"
    | "campaigns"
    | "library"
    | "documents"
    | "chat"
    | "agents",
    boolean
  >
>;

export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  currentWorkspaceId: uuid("current_workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  theme: text("theme").default("system"),
  toursCompleted: jsonb("tours_completed")
    .$type<ToursCompleted>()
    .notNull()
    .default({}),
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
 * Copywriter and Localizer agents inject the structured voice card into
 * their system prompts.
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
    /**
     * Locale-tagged canonical phrases the brand uses. Distinct from
     * `requiredWords` (single-token vocabulary). Populated by the
     * Tone-of-Voice document extractor; manually editable.
     * Shape: `{ en: [...], pl: [...], ro: [...], uk: [...] }`.
     */
    signaturePhrases: jsonb("signature_phrases")
      .$type<Partial<Record<"en" | "pl" | "ro" | "uk", string[]>>>()
      .notNull()
      .default({}),
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
 * Agent runs — Copywriter + Localizer multi-agent orchestrations.
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

/**
 * Channel hint for copywriter briefs. Affects format expectations only.
 *
 * The first 8 values are legacy identifiers, retained for back-compat. The
 * hyphen-namespaced values are Diana's customisable-channels set — they
 * have richer component schemas defined in `channel_definition`
 * (per-workspace, drag-reorderable, with optional per-component prompt
 * overrides).
 */
export const channelEnum = pgEnum("channel", [
  "ad",
  "email",
  "landing",
  "social",
  "blog",
  "headline",
  "product_description",
  "other",
  // Diana's customisable channels.
  "email-marketing",
  "email-transactional",
  "ig-post",
  "ig-story",
  "fb-ad",
  "landing-hero",
  "sms",
  "push",
]);

/**
 * Component types in a channel's schema. Tells the drafter how the component
 * is shaped (so prompts can constrain output appropriately) and lets the UI
 * pick the right input control:
 *  - `short`: single-line, headline-shaped (subject, hook, CTA copy)
 *  - `long`:  multi-paragraph, body-shaped (email body, blog excerpt)
 *  - `cta`:   button copy / link text — usually < 5 words
 */
export type ChannelComponentType = "short" | "long" | "cta";

/**
 * One field inside a channel's component schema. Stable IDs (used as
 * map keys in `campaign_asset.components`) so renaming the label doesn't
 * orphan existing assets.
 */
export interface ChannelComponent {
  id: string;
  label: string;
  type: ChannelComponentType;
  required: boolean;
  hint?: string;
  maxLength?: number;
  /** Optional per-component prompt override. When set, the drafter uses
   *  this instead of its generic per-type instruction for this field. */
  prompt?: string;
}

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
  /**
   * One or more target locales. Legacy runs (V1.x and earlier) stored a
   * single `targetLocale` string instead — both shapes are accepted at read
   * time so existing rows keep rendering correctly.
   */
  targetLocales?: Array<(typeof localeEnum.enumValues)[number]>;
  /** @deprecated Kept for compatibility with single-target runs. */
  targetLocale?: (typeof localeEnum.enumValues)[number];
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
 * Documents — long-form writing surface with inline AI commands.
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
 * Knowledge base — workspace-scoped sources + pgvector chunks.
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
 *  Default: OpenAI text-embedding-3-small @ 1536 dims. */
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

/* ----------------------------------------------------------------------------
 * Chat — threaded conversations with voice + KB grounding.
 * Composes everything: voice card injected into the system prompt, KB chunks
 * retrieved per-message and woven in, model resolved through the same
 * provider abstraction as agent runs.
 * -------------------------------------------------------------------------- */

export const chatRoleEnum = pgEnum("chat_role", [
  "system",
  "user",
  "assistant",
]);

export const chatThreads = pgTable(
  "chat_thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Auto-derived from first user message or user-edited. */
    title: text("title").notNull().default("New chat"),
    /** Optional brand voice — when set, every assistant turn injects the voice card. */
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull().default("en"),
    /** Optional custom system prompt to layer on top of voice card. */
    systemPrompt: text("system_prompt"),
    /** Knowledge sources to consult for retrieval per turn. */
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    /** Model id override for this thread (defaults to drafting role). */
    modelId: text("model_id"),
    pinned: boolean("pinned").notNull().default(false),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_thread_workspace_idx").on(t.workspaceId, t.updatedAt),
    index("chat_thread_voice_idx").on(t.voiceId),
    index("chat_thread_pinned_idx").on(t.workspaceId, t.pinned),
  ],
);

export const chatMessages = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** Model used to generate this message (assistant only). */
    modelId: text("model_id"),
    provider: text("provider"),
    /** Knowledge source ids retrieved for this turn — for traceability. */
    retrievedSourceIds: jsonb("retrieved_source_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("chat_message_thread_idx").on(t.threadId, t.createdAt)],
);

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [chatThreads.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [chatThreads.voiceId],
    references: [brandVoices.id],
  }),
  createdBy: one(users, {
    fields: [chatThreads.createdByUserId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
}));

export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ChatRole = (typeof chatRoleEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Campaigns — a campaign produces multiple linked assets in one
 * orchestrated run (blog + social + email + ad variants), all sharing voice
 * and KB. Each asset is auditable and savable independently.
 * -------------------------------------------------------------------------- */

export const campaignStatusEnum = pgEnum("campaign_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const campaignAssetStatusEnum = pgEnum("campaign_asset_status", [
  "draft",
  "saved",
  "discarded",
]);

export interface CampaignPlanItem {
  channel: (typeof channelEnum.enumValues)[number];
  label: string;
  angle: string;
  length_hint: string;
}

export interface CampaignPlan {
  strategy: string;
  hook: string;
  assets: CampaignPlanItem[];
}

export const campaigns = pgTable(
  "campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    audienceOverride: text("audience_override"),
    productInfo: text("product_info"),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull().default("en"),
    /** Channels the user requested. Planner respects this list. */
    requestedChannels: jsonb("requested_channels")
      .$type<Array<(typeof channelEnum.enumValues)[number]>>()
      .notNull()
      .default([]),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    status: campaignStatusEnum("status").notNull().default("queued"),
    plan: jsonb("plan").$type<CampaignPlan>(),
    plannerModelId: text("planner_model_id"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
  },
  (t) => [
    index("campaign_workspace_idx").on(t.workspaceId, t.createdAt),
    index("campaign_voice_idx").on(t.voiceId),
    index("campaign_status_idx").on(t.workspaceId, t.status),
  ],
);

export const campaignAssets = pgTable(
  "campaign_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull().default("en"),
    /** Order within the campaign (0-indexed). */
    seq: integer("seq").notNull(),
    channel: channelEnum("channel").notNull(),
    label: text("label").notNull(),
    strategy: text("strategy"),
    content: text("content").notNull(),
    rationale: text("rationale"),
    /**
     * Multi-component output. When non-null, this asset was generated
     * against a `channel_definition` schema and `content` is the
     * single-string fallback (for back-compat with older asset cards). New
     * UI reads from this map first, keyed by the channel definition's
     * component IDs (e.g. `subject`, `preheader`, `body`, `cta`). Legacy
     * assets have NULL here and render via the `content` column.
     */
    components: jsonb("components")
      .$type<Record<string, string> | null>()
      .default(null),
    auditScore: integer("audit_score"),
    auditSummary: text("audit_summary"),
    auditStrengths: jsonb("audit_strengths").$type<string[]>().notNull().default([]),
    auditIssues: jsonb("audit_issues").$type<VoiceAuditIssue[]>().notNull().default([]),
    drafterModelId: text("drafter_model_id"),
    auditorModelId: text("auditor_model_id"),
    status: campaignAssetStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    savedAt: timestamp("saved_at", { mode: "date" }),
  },
  (t) => [
    index("campaign_asset_campaign_idx").on(t.campaignId, t.seq),
    index("campaign_asset_workspace_idx").on(t.workspaceId, t.status),
    index("campaign_asset_voice_idx").on(t.voiceId),
  ],
);

/* ----------------------------------------------------------------------------
 * Channel definitions — per-workspace component schemas.
 *
 * Each row defines, for one (workspace × channel), the ordered list of
 * components the drafter should produce. Pre-seeded with sensible defaults
 * on workspace creation (see DEFAULT_CHANNEL_DEFINITIONS); editable by users
 * in Settings → Channels (drag-reorder, add/remove, optional per-component
 * prompt override).
 * -------------------------------------------------------------------------- */
export const channelDefinitions = pgTable(
  "channel_definition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /**
     * The channel identifier this definition applies to. References the
     * channel enum so the existing planner / drafter / library_entry code
     * stays type-safe with one canonical set of channel ids.
     */
    channelId: channelEnum("channel_id").notNull(),
    /** Display name. Editable per workspace ("Newsletter" instead of
     *  "Email marketing"). */
    label: text("label").notNull(),
    /** Ordered array of component definitions. */
    components: jsonb("components").$type<ChannelComponent[]>().notNull().default([]),
    /**
     * Sort key for the channel listing in Settings → Channels and the
     * campaign builder's channel picker. Lower = earlier.
     */
    ordering: integer("ordering").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    /** One definition per (workspace, channel). */
    uniqueIndex("channel_definition_workspace_channel_unique").on(
      t.workspaceId,
      t.channelId,
    ),
    index("channel_definition_workspace_order_idx").on(t.workspaceId, t.ordering),
  ],
);

export const channelDefinitionsRelations = relations(
  channelDefinitions,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [channelDefinitions.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export type ChannelDefinition = typeof channelDefinitions.$inferSelect;

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [campaigns.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [campaigns.voiceId],
    references: [brandVoices.id],
  }),
  createdBy: one(users, {
    fields: [campaigns.createdByUserId],
    references: [users.id],
  }),
  assets: many(campaignAssets),
}));

export const campaignAssetsRelations = relations(campaignAssets, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignAssets.campaignId],
    references: [campaigns.id],
  }),
  workspace: one(workspaces, {
    fields: [campaignAssets.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [campaignAssets.voiceId],
    references: [brandVoices.id],
  }),
}));

export type Campaign = typeof campaigns.$inferSelect;
export type CampaignAsset = typeof campaignAssets.$inferSelect;
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];
export type CampaignAssetStatus =
  (typeof campaignAssetStatusEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Workspace invitations — invite-by-link flow on top of the multi-tenant
 * data model. Auth.js handles sign-in; once authed, the recipient hits
 * /invitations/[token] and lands as a member with the role the inviter
 * chose.
 * -------------------------------------------------------------------------- */

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const workspaceInvitations = pgTable(
  "workspace_invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Recipient email — informational; users can sign in with any address. */
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull().default("editor"),
    /** URL-safe random token (32 bytes base64url). */
    token: text("token").notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("workspace_invitation_workspace_idx").on(t.workspaceId, t.status),
    index("workspace_invitation_email_idx").on(t.email),
  ],
);

export const workspaceInvitationsRelations = relations(
  workspaceInvitations,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceInvitations.workspaceId],
      references: [workspaces.id],
    }),
    invitedBy: one(users, {
      fields: [workspaceInvitations.invitedByUserId],
      references: [users.id],
    }),
    acceptedBy: one(users, {
      fields: [workspaceInvitations.acceptedByUserId],
      references: [users.id],
    }),
  }),
);

export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type InvitationStatus =
  (typeof invitationStatusEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Library entries — polymorphic catalog of saved snippets.
 *
 * Saved copy variants live in `copy_variants` with `status='saved'`;
 * this table extends the library to other surfaces — chat messages and
 * Tiptap document selections. Each entry snapshots the content at save time
 * (so source deletion or edit doesn't lose the saved snippet) and links back
 * to the source for "open original".
 *
 * The Library page projects rows from BOTH `copy_variants` (saved status)
 * and `library_entries` into a single unified DTO; this keeps the variant
 * lifecycle (save / discard / re-audit) on its existing source of truth and
 * avoids dual-write hazards.
 * -------------------------------------------------------------------------- */

export const libraryEntryKindEnum = pgEnum("library_entry_kind", [
  "chat_message",
  "document_selection",
  /** User-curated reference exemplar. Hand-picked human-written
   * best-example copy that the copywriter agent retrieves as a *style*
   * reference. Distinct from KB chunks (factual sources). */
  "manual",
]);

/** Whether a library entry was AI-generated (saved off a chat / document
 * selection / variant) or hand-written by a human as a reference. Used by
 * the Library UI for filtering and by the copywriter agent for routing
 * (manual = exemplar lane; generated = saved-output lane). */
export const librarySourceEnum = pgEnum("library_entry_source", [
  "manual",
  "generated",
]);

export const libraryEntries = pgTable(
  "library_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: libraryEntryKindEnum("kind").notNull(),
    /**
     * Whether this entry is an AI-generated save (`generated`) or a
     * human-written reference exemplar (`manual`). Defaults to `generated`
     * so existing chat_message / document_selection rows backfill cleanly.
     * Manual entries are surfaced separately in the Library UI and feed
     * into the copywriter's exemplar retrieval lane.
     */
    source: librarySourceEnum("source").notNull().default("generated"),
    /** Snapshot of the content at save time. Survives source deletion. */
    content: text("content").notNull(),
    /** Optional short label ("from Q3 launch chat", "hero copy v2"). */
    title: text("title"),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull().default("en"),
    /**
     * Channel scope for retrieval. On manual entries this is the channel
     * the exemplar belongs to ("email-marketing", "ig-post", ...). Null on
     * generated entries that aren't channel-specific. Re-uses the same
     * channel enum the campaign asset table uses.
     */
    channel: channelEnum("channel"),
    /** User-applied tags for filtering / grouping. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Free-form key/value metadata. Reserved for future use; defaults `{}`. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    /** Source links — exactly one is populated based on kind. */
    chatMessageId: uuid("chat_message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    chatThreadId: uuid("chat_thread_id").references(() => chatThreads.id, {
      onDelete: "set null",
    }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    /** Tiptap selection range — used to highlight on "open original". */
    selectionAnchor: jsonb("selection_anchor").$type<{
      from: number;
      to: number;
    } | null>(),
    savedByUserId: text("saved_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("library_entry_workspace_idx").on(t.workspaceId, t.createdAt),
    index("library_entry_kind_idx").on(t.workspaceId, t.kind, t.createdAt),
    index("library_entry_voice_idx").on(t.voiceId),
    index("library_entry_chat_message_idx").on(t.chatMessageId),
    index("library_entry_document_idx").on(t.documentId),
    /**
     * Drives the manual-exemplar retrieval lane in the copywriter drafter:
     * filter by (workspace, source=manual, channel, voice). Small corpus,
     * curated — we don't vector-search this, we just list and limit.
     */
    index("library_entry_exemplar_idx").on(
      t.workspaceId,
      t.source,
      t.channel,
      t.voiceId,
    ),
  ],
);

export const libraryEntriesRelations = relations(libraryEntries, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [libraryEntries.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(brandVoices, {
    fields: [libraryEntries.voiceId],
    references: [brandVoices.id],
  }),
  chatMessage: one(chatMessages, {
    fields: [libraryEntries.chatMessageId],
    references: [chatMessages.id],
  }),
  chatThread: one(chatThreads, {
    fields: [libraryEntries.chatThreadId],
    references: [chatThreads.id],
  }),
  document: one(documents, {
    fields: [libraryEntries.documentId],
    references: [documents.id],
  }),
  savedBy: one(users, {
    fields: [libraryEntries.savedByUserId],
    references: [users.id],
  }),
}));

export type LibraryEntry = typeof libraryEntries.$inferSelect;
export type LibraryEntryKind = (typeof libraryEntryKindEnum.enumValues)[number];
export type LibrarySource = (typeof librarySourceEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * SEO post-hoc audit — score + suggestions + applied rewrites.
 *
 * On-demand audit of a document. Each run produces a full snapshot row in
 * `seo_audit_report` (history is retained — enables re-audit comparison and
 * future trend tracking without schema change). Suggestions live inside the
 * report's jsonb column; an apply lifts them through the copywriter agent.
 *
 * SERP scrape results are cached for 24h in `seo_serp_cache`, keyed by
 * (workspace, keyword, locale-domain). Workspace-scoped per the multi-tenant
 * model even though the underlying data is public.
 *
 * Per-locale heuristics (e.g., Polish users use longer queries) ship as TS
 * constants in `src/lib/seo/locale-heuristics.ts`. Workspaces can override
 * per-locale via `seo_locale_heuristics_override`; absent rows fall back to
 * the constant defaults.
 * -------------------------------------------------------------------------- */

export const seoIntentEnum = pgEnum("seo_intent", [
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);

export const seoSuggestionTypeEnum = pgEnum("seo_suggestion_type", [
  "rewrite_paragraph",
  "add_section",
  "tighten_section",
  "add_lsi_keyword",
  "add_heading",
]);

export const seoSuggestionStatusEnum = pgEnum("seo_suggestion_status", [
  "pending",
  "applied",
  "rejected",
]);

/** Per-criterion score detail. `score` is 0-100; `details` is criterion-shaped
 *  (e.g., density returns `{ count, ratio, target }`; readability returns
 *  `{ flesch, gradeLevel }`). UI shows the score + a tooltip with details. */
export interface SeoCriterionScore {
  score: number;
  details: Record<string, unknown>;
}

/** Full per-criterion breakdown stored on each audit report. Seven axes; one
 *  pure plumbing pattern across them so adding criteria later is a one-line
 *  schema change (just a new key). */
export interface SeoCriterionScores {
  density: SeoCriterionScore;
  semantic: SeoCriterionScore;
  intent: SeoCriterionScore;
  structure: SeoCriterionScore;
  length: SeoCriterionScore;
  readability: SeoCriterionScore;
  contentGap: SeoCriterionScore;
}

/** A single suggestion produced by the audit. `proposed` is filled lazily —
 *  the scorer emits suggestion shells (type + excerpt + description), the
 *  copywriter agent fills `proposed` when the marketer clicks "apply". */
export interface SeoSuggestion {
  id: string;
  type: (typeof seoSuggestionTypeEnum.enumValues)[number];
  status: (typeof seoSuggestionStatusEnum.enumValues)[number];
  excerpt?: string;
  description: string;
  proposed?: string;
  appliedAt?: string;
  rejectedAt?: string;
}

export const seoAuditReports = pgTable(
  "seo_audit_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    voiceId: uuid("voice_id").references(() => brandVoices.id, {
      onDelete: "set null",
    }),
    locale: localeEnum("locale").notNull(),
    primaryKeyword: text("primary_keyword").notNull(),
    /** Was the primary keyword AI-inferred or marketer-supplied? */
    primaryKeywordInferred: boolean("primary_keyword_inferred")
      .notNull()
      .default(false),
    secondaryKeywords: jsonb("secondary_keywords")
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Search intent inferred for the doc. Compared against the SERP intent
     *  fit for the `intent` criterion. */
    detectedIntent: seoIntentEnum("detected_intent"),
    /** Composite 0-100 across all criteria. Weighted equal in V1; the
     *  per-criterion column is the audit-able source of truth. */
    compositeScore: integer("composite_score").notNull(),
    criterionScores: jsonb("criterion_scores")
      .$type<SeoCriterionScores>()
      .notNull(),
    suggestions: jsonb("suggestions")
      .$type<SeoSuggestion[]>()
      .notNull()
      .default([]),
    /** Snapshot of the doc text at audit time, so re-audit comparison and
     *  the diff-modal apply path don't drift if the doc edits during. */
    docTextSnapshot: text("doc_text_snapshot").notNull(),
    auditorModelId: text("auditor_model_id"),
    copywriterModelId: text("copywriter_model_id"),
    /** Total wall-clock duration of the audit (including SERP fetch). */
    durationMs: integer("duration_ms"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("seo_audit_report_workspace_idx").on(t.workspaceId, t.createdAt),
    index("seo_audit_report_document_idx").on(t.documentId, t.createdAt),
  ],
);

/** 24h cache of SERP scrape results, keyed on (workspace, keyword, locale).
 *  Each row stores up to top-10 results with title + H1 + H2 outline + a
 *  truncated full-text body (~5000 chars) for the content-gap scorer. */
export const seoSerpCache = pgTable(
  "seo_serp_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locale: localeEnum("locale").notNull(),
    /** Array of top-N (N≤10) search results, oldest-rank first. */
    results: jsonb("results")
      .$type<
        Array<{
          rank: number;
          url: string;
          title: string;
          h1?: string;
          h2: string[];
          fullText: string;
        }>
      >()
      .notNull(),
    fetchedAt: timestamp("fetched_at", { mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("seo_serp_cache_unique").on(t.workspaceId, t.keyword, t.locale),
    index("seo_serp_cache_expires_idx").on(t.expiresAt),
  ],
);

/** Structured locale heuristics that influence audit prompts and intent
 *  classification. Keys map to handlers in the scorer / intent classifier. */
export interface SeoLocaleHeuristics {
  /** Average query length in tokens for this locale; informs intent fit. */
  avgQueryTokens?: number;
  /** Locale-specific commercial-intent trigger words (e.g., "cena", "kupić" in pl). */
  commercialIntentTriggers?: string[];
  /** Locale-specific informational-intent trigger words ("jak", "co to" in pl). */
  informationalIntentTriggers?: string[];
  /** Free-form notes that get appended to the auditor agent's system prompt. */
  notes?: string;
}

/** Per-workspace override of the default TS heuristics. Absent rows fall
 *  back to the constants in `src/lib/seo/locale-heuristics.ts`. */
export const seoLocaleHeuristicsOverride = pgTable(
  "seo_locale_heuristics_override",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    heuristics: jsonb("heuristics")
      .$type<SeoLocaleHeuristics>()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.locale] })],
);

export const seoAuditReportsRelations = relations(
  seoAuditReports,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [seoAuditReports.workspaceId],
      references: [workspaces.id],
    }),
    document: one(documents, {
      fields: [seoAuditReports.documentId],
      references: [documents.id],
    }),
    voice: one(brandVoices, {
      fields: [seoAuditReports.voiceId],
      references: [brandVoices.id],
    }),
    createdBy: one(users, {
      fields: [seoAuditReports.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const seoSerpCacheRelations = relations(seoSerpCache, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [seoSerpCache.workspaceId],
    references: [workspaces.id],
  }),
}));

export const seoLocaleHeuristicsOverrideRelations = relations(
  seoLocaleHeuristicsOverride,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [seoLocaleHeuristicsOverride.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export type SeoAuditReport = typeof seoAuditReports.$inferSelect;
export type SeoSerpCacheRow = typeof seoSerpCache.$inferSelect;
export type SeoLocaleHeuristicsOverrideRow =
  typeof seoLocaleHeuristicsOverride.$inferSelect;
export type SeoIntent = (typeof seoIntentEnum.enumValues)[number];
export type SeoSuggestionType =
  (typeof seoSuggestionTypeEnum.enumValues)[number];
export type SeoSuggestionStatus =
  (typeof seoSuggestionStatusEnum.enumValues)[number];

/* ----------------------------------------------------------------------------
 * Brand profile — conversational config + website extractor onboarding.
 *
 * A workspace has at most one brand_profile. The profile is mostly jsonb to
 * keep iteration cheap; rows in `brand_voices` (the original voice-analyzer
 * table) are not replaced — the existing copywriter / localizer agents still
 * read from there during the migration period. When the conversationalist
 * runs voice-analyzer on sample copy, it persists the resulting voice card
 * in BOTH places (brand_profile.voice[locale] is the canonical reading;
 * brand_voices keeps legacy code working).
 *
 * Snapshot history lives in `brand_profile_revisions` — full jsonb copies,
 * not deltas. Each save (manual, NL command, deep-dive, crawl extract,
 * roll-back) writes a new revision so the marketer can undo without
 * round-tripping through diff logic.
 *
 * Chats and crawls are stored as their own threads so re-open works.
 * -------------------------------------------------------------------------- */

export const brandProfileChatKindEnum = pgEnum("brand_profile_chat_kind", [
  "onboarding",
  "seo_deep_dive",
  "localizer_deep_dive",
]);

export const brandProfileChatStatusEnum = pgEnum(
  "brand_profile_chat_status",
  ["active", "completed", "abandoned"],
);

export const brandProfileRevisionTypeEnum = pgEnum(
  "brand_profile_revision_type",
  [
    "initial",
    "manual_save",
    "nl_command",
    "deep_dive_save",
    "crawl_extract",
    "roll_back",
    "voice_analyzer",
  ],
);

export const brandProfileCrawlStatusEnum = pgEnum(
  "brand_profile_crawl_status",
  ["pending", "ready", "failed"],
);

/** Per-locale voice variant. Wraps the existing VoiceCardForPrompt shape
 *  with spec extras: formality (1-10 dial), emotional register, sample
 *  pieces[]. `renderVoiceCard` from voice-card.ts can read the overlap
 *  fields directly. */
export interface BrandProfileVoiceVariant {
  toneDescriptors: string[];
  voicePersona: string;
  audience: string;
  readingLevel: string;
  formality: number;
  emotionalRegister: string;
  dos: VoiceCardRule[];
  donts: VoiceCardRule[];
  vocabularyPreferences: string[];
  requiredWords: string[];
  forbiddenWords: string[];
  samplePieces: string[];
  /** Set when the voice-analyzer agent fed real samples through. UI shows
   *  a confidence indicator based on this. */
  fromSampleAnalysis: boolean;
}

export interface BrandProfileOffering {
  name: string;
  description: string;
  category?: string;
}

export interface BrandProfileFact {
  fact: string;
  category?: string;
}

export interface BrandProfileFAQ {
  question: string;
  answer: string;
}

export interface BrandProfileKnowledge {
  offerings: BrandProfileOffering[];
  facts: BrandProfileFact[];
  faqs: BrandProfileFAQ[];
}

export interface BrandProfileAudience {
  /** Stable identifier — survives renames + re-orderings so deep-dive
   *  chats can refer to the same audience across edits. */
  id: string;
  name: string;
  demographics: string;
  psychographics: string;
  painPoints: string[];
  jobsToBeDone: string[];
  decisionCriteria: string[];
}

export interface BrandProfileCompetitor {
  id: string;
  name: string;
  url?: string;
  positioning?: string;
  whyTheyWin: string[];
  whyWeWin: string[];
}

export interface BrandProfilePositioning {
  differentiators: string[];
  brandValues: string[];
  standsFor: string[];
  standsAgainst: string[];
}

export const brandProfiles = pgTable(
  "brand_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tagline: text("tagline"),
    mission: text("mission"),
    /** Top-level brand values (e.g., "transparency", "craft"). 3-8 typical. */
    values: jsonb("values").$type<string[]>().notNull().default([]),
    /** Locales the brand actually operates in. Subset of [en, pl, ro, uk]. */
    locales: jsonb("locales")
      .$type<Array<(typeof localeEnum.enumValues)[number]>>()
      .notNull()
      .default(["en"]),
    /** Per-locale voice. Marketers see one variant per locale they operate in. */
    voice: jsonb("voice")
      .$type<
        Partial<
          Record<
            (typeof localeEnum.enumValues)[number],
            BrandProfileVoiceVariant
          >
        >
      >()
      .notNull()
      .default({}),
    knowledge: jsonb("knowledge")
      .$type<BrandProfileKnowledge>()
      .notNull()
      .default({ offerings: [], facts: [], faqs: [] }),
    /** Per-locale audience array — different markets, different ICPs. */
    audiences: jsonb("audiences")
      .$type<
        Partial<
          Record<
            (typeof localeEnum.enumValues)[number],
            BrandProfileAudience[]
          >
        >
      >()
      .notNull()
      .default({}),
    positioning: jsonb("positioning")
      .$type<BrandProfilePositioning>()
      .notNull()
      .default({
        differentiators: [],
        brandValues: [],
        standsFor: [],
        standsAgainst: [],
      }),
    competitors: jsonb("competitors")
      .$type<BrandProfileCompetitor[]>()
      .notNull()
      .default([]),
    /** True once the marketer marks the initial onboarding complete. Used
     *  by the dashboard auto-trigger to know whether to nudge them. */
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    /** One profile per workspace (single-brand-per-workspace per roadmap). */
    uniqueIndex("brand_profile_workspace_unique").on(t.workspaceId),
  ],
);

/** Full snapshot of a brand_profile at one point in time. Simpler than
 *  diffing; we just persist the whole jsonb blob each revision. */
export const brandProfileRevisions = pgTable(
  "brand_profile_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => brandProfiles.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Full profile snapshot at this revision. */
    snapshot: jsonb("snapshot")
      .$type<typeof brandProfiles.$inferSelect>()
      .notNull(),
    revisionType: brandProfileRevisionTypeEnum("revision_type").notNull(),
    /** Optional human-readable note ("after NL command: make Polish voice more formal"). */
    note: text("note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("brand_profile_revision_profile_idx").on(t.profileId, t.createdAt),
    index("brand_profile_revision_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

/** A chat thread — onboarding or per-tool deep-dive. Re-open replays the
 *  literal transcript. */
export const brandProfileChats = pgTable(
  "brand_profile_chat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => brandProfiles.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: brandProfileChatKindEnum("kind").notNull(),
    title: text("title").notNull().default("Onboarding"),
    status: brandProfileChatStatusEnum("status").notNull().default("active"),
    /** Optional axis identifier the chat focuses on (voice, knowledge,
     *  audience, positioning, samples, or null for the main onboarding). */
    axis: text("axis"),
    locale: localeEnum("locale"),
    turnsRemaining: integer("turns_remaining").notNull().default(25),
    lastTurnAt: timestamp("last_turn_at", { mode: "date" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("brand_profile_chat_profile_idx").on(t.profileId, t.kind),
    index("brand_profile_chat_workspace_idx").on(t.workspaceId, t.updatedAt),
  ],
);

export const brandProfileChatMessages = pgTable(
  "brand_profile_chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => brandProfileChats.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** When the assistant turn captures a structured field, the extracted
     *  patch lands here. Replay can recompute "what was captured at turn N"
     *  by folding messages in order. */
    structuredPatch: jsonb("structured_patch").$type<
      Record<string, unknown> | null
    >(),
    modelId: text("model_id"),
    provider: text("provider"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("brand_profile_chat_message_chat_idx").on(t.chatId, t.createdAt)],
);

/** Cached output of a website extraction crawl. Keyed on (workspace, url,
 *  jsRendered) so a marketer can compare static-vs-JS extraction. */
export const brandProfileCrawls = pgTable(
  "brand_profile_crawl",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Original URL the marketer pasted. */
    url: text("url").notNull(),
    /** URL after redirects + canonicalization. */
    finalUrl: text("final_url"),
    /** Pages visited + their extracted content. Each page may carry a
     *  locale annotation when multi-language detection fires. */
    extractedContent: jsonb("extracted_content")
      .$type<{
        pages: Array<{
          url: string;
          locale?: (typeof localeEnum.enumValues)[number];
          title: string;
          text: string;
          headings: { h1: string[]; h2: string[]; h3: string[] };
        }>;
        detectedLocales: Array<(typeof localeEnum.enumValues)[number]>;
        sitemapFound: boolean;
        robotsBlocked: boolean;
      } | null>(),
    status: brandProfileCrawlStatusEnum("status").notNull().default("pending"),
    /** True if Playwright was used to render JS for this crawl. */
    jsRendered: boolean("js_rendered").notNull().default(false),
    /** Optional reference to the BYOK cookie used for the crawl. */
    cookieProfileId: uuid("cookie_profile_id"),
    error: text("error"),
    crawledAt: timestamp("crawled_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("brand_profile_crawl_unique").on(
      t.workspaceId,
      t.url,
      t.jsRendered,
    ),
    index("brand_profile_crawl_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

/** BYOK cookie store for crawling login-gated content. Encrypted at rest
 *  via the same AES-256-GCM helper as api_keys. */
export const brandProfileCookies = pgTable(
  "brand_profile_cookie",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Cookie domain scope, e.g. "example.com" or "*.example.com". */
    domain: text("domain").notNull(),
    /** Human-friendly label ("My Notion workspace"). */
    label: text("label").notNull(),
    /** AES-256-GCM ciphertext (base64). Plaintext is the full
     *  cookie-header string the marketer pasted. */
    ciphertext: text("ciphertext").notNull(),
    /** Last 4 chars of the plaintext, for UI display. */
    last4: text("last4").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("brand_profile_cookie_workspace_idx").on(t.workspaceId)],
);

export const brandProfilesRelations = relations(
  brandProfiles,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [brandProfiles.workspaceId],
      references: [workspaces.id],
    }),
    createdBy: one(users, {
      fields: [brandProfiles.createdByUserId],
      references: [users.id],
    }),
    revisions: many(brandProfileRevisions),
    chats: many(brandProfileChats),
  }),
);

export const brandProfileRevisionsRelations = relations(
  brandProfileRevisions,
  ({ one }) => ({
    profile: one(brandProfiles, {
      fields: [brandProfileRevisions.profileId],
      references: [brandProfiles.id],
    }),
    createdBy: one(users, {
      fields: [brandProfileRevisions.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const brandProfileChatsRelations = relations(
  brandProfileChats,
  ({ one, many }) => ({
    profile: one(brandProfiles, {
      fields: [brandProfileChats.profileId],
      references: [brandProfiles.id],
    }),
    messages: many(brandProfileChatMessages),
    createdBy: one(users, {
      fields: [brandProfileChats.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const brandProfileChatMessagesRelations = relations(
  brandProfileChatMessages,
  ({ one }) => ({
    chat: one(brandProfileChats, {
      fields: [brandProfileChatMessages.chatId],
      references: [brandProfileChats.id],
    }),
  }),
);

export const brandProfileCrawlsRelations = relations(
  brandProfileCrawls,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [brandProfileCrawls.workspaceId],
      references: [workspaces.id],
    }),
    createdBy: one(users, {
      fields: [brandProfileCrawls.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const brandProfileCookiesRelations = relations(
  brandProfileCookies,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [brandProfileCookies.workspaceId],
      references: [workspaces.id],
    }),
    createdBy: one(users, {
      fields: [brandProfileCookies.createdByUserId],
      references: [users.id],
    }),
  }),
);

export type BrandProfile = typeof brandProfiles.$inferSelect;
export type BrandProfileRevision = typeof brandProfileRevisions.$inferSelect;
export type BrandProfileChat = typeof brandProfileChats.$inferSelect;
export type BrandProfileChatMessage =
  typeof brandProfileChatMessages.$inferSelect;
export type BrandProfileCrawl = typeof brandProfileCrawls.$inferSelect;
export type BrandProfileCookie = typeof brandProfileCookies.$inferSelect;
export type BrandProfileChatKind =
  (typeof brandProfileChatKindEnum.enumValues)[number];
export type BrandProfileChatStatus =
  (typeof brandProfileChatStatusEnum.enumValues)[number];
export type BrandProfileRevisionType =
  (typeof brandProfileRevisionTypeEnum.enumValues)[number];
export type BrandProfileCrawlStatus =
  (typeof brandProfileCrawlStatusEnum.enumValues)[number];
