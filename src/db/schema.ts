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
