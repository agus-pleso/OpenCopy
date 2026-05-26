import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import {
  brandVoices,
  copyVariants,
  type Locale,
  type VoiceCardLocaleNotes,
} from "@/db/schema";
import { runLocalizer } from "../localizer";
import type { VoiceCardForPrompt } from "../voice-card";

/**
 * Chat tools.
 *
 * The assistant gets a workspace-scoped toolbox. Every tool reads or mutates
 * data only inside the caller's workspace — the closure captures `workspaceId`
 * and `userId` so the model never sees those params and can't escape the
 * workspace by passing a different id.
 *
 * Mutating tools never delete. Worst case the user gets a stale write they
 * can fix in the UI. We deliberately don't expose a delete tool — destructive
 * actions stay in the explicit UI buttons.
 */

export interface ChatToolsContext {
  workspaceId: string;
  userId: string;
  /** The thread's currently-attached voice id, if any — passed in as default. */
  attachedVoiceId?: string | null;
  /** Default locale for variant lookups when the user doesn't specify. */
  defaultLocale: Locale;
}

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);
const RuleSchema = z.object({
  rule: z.string().min(1).max(400),
  why: z.string().max(400).optional(),
});

export function buildChatTools(ctx: ChatToolsContext) {
  return {
    /* ----------------------------- voices ----------------------------- */

    list_brand_voices: tool({
      description:
        "List the brand voices in this workspace. Returns id, name, status, and whether each has been analyzed. Use this when the user asks about voices, wants to switch context, or asks to edit a voice without naming the id.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db.query.brandVoices.findMany({
          where: eq(brandVoices.workspaceId, ctx.workspaceId),
          orderBy: [desc(brandVoices.updatedAt)],
          columns: {
            id: true,
            name: true,
            status: true,
            analyzedAt: true,
            updatedAt: true,
          },
        });
        return {
          voices: rows.map((v) => ({
            id: v.id,
            name: v.name,
            status: v.status,
            analyzed: !!v.analyzedAt,
            updatedAt: v.updatedAt.toISOString(),
            attached: v.id === ctx.attachedVoiceId,
          })),
        };
      },
    }),

    get_brand_voice: tool({
      description:
        "Read the full voice card for a brand voice. Use this BEFORE update_brand_voice so you can return a meaningful diff to the user.",
      inputSchema: z.object({
        voiceId: z
          .string()
          .uuid()
          .describe(
            "The voice id. Omit to read the voice attached to this chat (if any).",
          )
          .optional(),
      }),
      execute: async ({ voiceId }) => {
        const id = voiceId ?? ctx.attachedVoiceId;
        if (!id) {
          return {
            error:
              "No voice id provided and no voice is attached to this chat. Call list_brand_voices first.",
          };
        }
        const row = await db.query.brandVoices.findFirst({
          where: and(
            eq(brandVoices.id, id),
            eq(brandVoices.workspaceId, ctx.workspaceId),
          ),
        });
        if (!row) return { error: `Voice ${id} not found in this workspace.` };
        return {
          voice: {
            id: row.id,
            name: row.name,
            status: row.status,
            tone_descriptors: row.toneDescriptors,
            voice_persona: row.voicePersona,
            audience: row.audience,
            reading_level: row.readingLevel,
            dos: row.dos,
            donts: row.donts,
            required_words: row.requiredWords,
            forbidden_words: row.forbiddenWords,
            rationale: row.rationale,
            locale_notes: row.localeNotes,
            analyzed: !!row.analyzedAt,
          },
        };
      },
    }),

    update_brand_voice: tool({
      description:
        "Patch fields on a brand voice. Pass only the fields you want to change — omitted fields are left as-is. Use this when the user asks to make the voice more X, add a Do, drop a forbidden word, etc.",
      inputSchema: z.object({
        voiceId: z
          .string()
          .uuid()
          .describe(
            "The voice id. Omit to patch the voice attached to this chat.",
          )
          .optional(),
        tone_descriptors: z.array(z.string().min(1).max(60)).max(12).optional(),
        voice_persona: z.string().min(1).max(600).optional(),
        audience: z.string().min(1).max(500).optional(),
        reading_level: z.string().min(1).max(60).optional(),
        dos: z.array(RuleSchema).max(12).optional(),
        donts: z.array(RuleSchema).max(12).optional(),
        required_words: z.array(z.string().min(1).max(60)).max(20).optional(),
        forbidden_words: z.array(z.string().min(1).max(60)).max(20).optional(),
        locale_notes: z
          .object({
            en: z.string().max(500).optional(),
            pl: z.string().max(500).optional(),
            ro: z.string().max(500).optional(),
            uk: z.string().max(500).optional(),
          })
          .optional(),
      }),
      execute: async (input) => {
        const id = input.voiceId ?? ctx.attachedVoiceId;
        if (!id) {
          return {
            error:
              "No voice id provided and no voice is attached to this chat. Call list_brand_voices first.",
          };
        }

        const existing = await db.query.brandVoices.findFirst({
          where: and(
            eq(brandVoices.id, id),
            eq(brandVoices.workspaceId, ctx.workspaceId),
          ),
        });
        if (!existing) {
          return { error: `Voice ${id} not found in this workspace.` };
        }

        const patch: Partial<typeof brandVoices.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (input.tone_descriptors !== undefined) {
          patch.toneDescriptors = input.tone_descriptors;
        }
        if (input.voice_persona !== undefined) {
          patch.voicePersona = input.voice_persona;
        }
        if (input.audience !== undefined) patch.audience = input.audience;
        if (input.reading_level !== undefined) {
          patch.readingLevel = input.reading_level;
        }
        if (input.dos !== undefined) {
          patch.dos = input.dos.map((d) => ({ rule: d.rule, why: d.why }));
        }
        if (input.donts !== undefined) {
          patch.donts = input.donts.map((d) => ({ rule: d.rule, why: d.why }));
        }
        if (input.required_words !== undefined) {
          patch.requiredWords = input.required_words;
        }
        if (input.forbidden_words !== undefined) {
          patch.forbiddenWords = input.forbidden_words;
        }
        if (input.locale_notes !== undefined) {
          patch.localeNotes = {
            ...existing.localeNotes,
            ...input.locale_notes,
          } as VoiceCardLocaleNotes;
        }

        await db.update(brandVoices).set(patch).where(eq(brandVoices.id, id));
        revalidatePath(`/voices/${id}`);
        revalidatePath("/voices");

        const changedKeys = Object.keys(patch).filter((k) => k !== "updatedAt");
        return {
          ok: true,
          voiceId: id,
          changed: changedKeys,
          message: `Updated ${changedKeys.length} field${changedKeys.length === 1 ? "" : "s"} on "${existing.name}".`,
        };
      },
    }),

    /* --------------------------- variants --------------------------- */

    list_recent_variants: tool({
      description:
        "List the most recent copy variants in the library (saved and drafts). Use this when the user asks to edit, refine, or comment on copy without naming a specific variant id.",
      inputSchema: z.object({
        voiceId: z.string().uuid().optional(),
        locale: LocaleEnum.optional(),
        savedOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ voiceId, locale, savedOnly, limit }) => {
        const conditions = [eq(copyVariants.workspaceId, ctx.workspaceId)];
        if (voiceId) conditions.push(eq(copyVariants.voiceId, voiceId));
        if (locale) conditions.push(eq(copyVariants.locale, locale));
        if (savedOnly) conditions.push(eq(copyVariants.status, "saved"));

        const rows = await db.query.copyVariants.findMany({
          where: and(...conditions),
          orderBy: [desc(copyVariants.savedAt), desc(copyVariants.createdAt)],
          limit: limit ?? 8,
          columns: {
            id: true,
            label: true,
            content: true,
            locale: true,
            status: true,
            auditScore: true,
            createdAt: true,
          },
        });

        return {
          variants: rows.map((v) => ({
            id: v.id,
            label: v.label,
            locale: v.locale,
            status: v.status,
            score: v.auditScore,
            preview: v.content.slice(0, 240),
            createdAt: v.createdAt.toISOString(),
          })),
        };
      },
    }),

    rewrite_copy_variant: tool({
      description:
        "Replace a copy variant's content with a new version. Use this when the user asks to refine, shorten, lengthen, or otherwise edit a specific variant. Pass the full new content — partial replacements aren't supported.",
      inputSchema: z.object({
        variantId: z.string().uuid(),
        content: z
          .string()
          .min(1)
          .max(8000)
          .describe("The full new copy. No labels, no preamble, no fences."),
      }),
      execute: async ({ variantId, content }) => {
        const existing = await db.query.copyVariants.findFirst({
          where: and(
            eq(copyVariants.id, variantId),
            eq(copyVariants.workspaceId, ctx.workspaceId),
          ),
        });
        if (!existing) {
          return { error: `Variant ${variantId} not found in this workspace.` };
        }

        await db
          .update(copyVariants)
          .set({
            content: content.trim(),
            // Mark refined so the UI surfaces "edited via chat".
            refinedContent: content.trim(),
          })
          .where(eq(copyVariants.id, variantId));
        revalidatePath("/library");
        revalidatePath(`/agents/runs/${existing.runId}`);

        return {
          ok: true,
          variantId,
          previousLength: existing.content.length,
          newLength: content.length,
          message: `Rewrote variant "${existing.label ?? variantId.slice(0, 8)}".`,
        };
      },
    }),

    /* ------------------------ localizations ------------------------ */

    localize_text: tool({
      description:
        "Localize a piece of text from one locale to another. Returns the localized copy plus a back-translation and any cultural notes. Use when the user asks to translate / localize / adapt copy in chat.",
      inputSchema: z.object({
        sourceText: z.string().min(20).max(20_000),
        sourceLocale: LocaleEnum,
        targetLocale: LocaleEnum,
        contextHint: z.string().max(500).optional(),
        useAttachedVoice: z
          .boolean()
          .describe(
            "If true, audit the localized output against the voice attached to this chat.",
          )
          .optional(),
      }),
      execute: async ({
        sourceText,
        sourceLocale,
        targetLocale,
        contextHint,
        useAttachedVoice,
      }) => {
        if (sourceLocale === targetLocale) {
          return { error: "Source and target locales must differ." };
        }

        let voiceCard: (VoiceCardForPrompt & { id: string }) | undefined;
        if (useAttachedVoice && ctx.attachedVoiceId) {
          const voice = await db.query.brandVoices.findFirst({
            where: and(
              eq(brandVoices.id, ctx.attachedVoiceId),
              eq(brandVoices.workspaceId, ctx.workspaceId),
            ),
          });
          if (voice) {
            voiceCard = {
              id: voice.id,
              name: voice.name,
              toneDescriptors: voice.toneDescriptors,
              voicePersona: voice.voicePersona,
              audience: voice.audience,
              readingLevel: voice.readingLevel,
              dos: voice.dos,
              donts: voice.donts,
              requiredWords: voice.requiredWords,
              forbiddenWords: voice.forbiddenWords,
              signaturePhrases: voice.signaturePhrases,
              localeNotes: voice.localeNotes,
            };
          }
        }

        const result = await runLocalizer(
          {
            voice: voiceCard,
            sourceText,
            sourceLocale,
            targetLocale,
            contextHint,
          },
          { workspaceId: ctx.workspaceId, userId: ctx.userId },
        );

        return {
          localized: result.target.target_text,
          backTranslation: result.backTranslation.back_translation,
          formality: result.adapter.formality_recommendation,
          notes: result.adapter.notes.map((n) => ({
            excerpt: n.excerpt,
            guidance: n.guidance,
          })),
          auditScore: result.audit?.overall_score ?? null,
        };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof buildChatTools>;
