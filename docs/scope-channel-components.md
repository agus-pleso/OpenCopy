# Channel components — scoping (deferred from Diana batch 2026-05-08)

**Status:** deferred. Not in `v2.3.0-rc.7`. Pick up on its own branch (e.g.
`feature/channel-components`) when ready.

## Why deferred

The three other items in Diana's 2026-05-08 batch (ToV extractor, manual
library exemplars, AI providers click bug) are P0/P1 and ship in
`v2.3.0-rc.7`. Channel components is a P2, **1.5–2 days** of work, and
includes a schema migration on `campaign_asset` plus a backfill for every
existing campaign's content. Bundling it with a P0 makes the RC fragile.
Splitting it out lets the simpler items ship today.

## What Diana asked for

> Email today = `subject + body`. Needs more (preheader, CTA, fallback,
> etc.). Channels become user-editable in Settings → Channels.
> Component schema: `{id, label, type: "short" | "long" | "cta",
> required, hint, maxLength, prompt?}`. Drag-to-reorder, add/remove,
> optional per-component prompt override. Ship defaults for
> email-marketing, email-transactional, ig-post, ig-story, fb-ad, blog,
> landing-hero, sms, push. Existing campaigns map to default schema and
> keep working.

## Affected surfaces (from the explore pass)

| Area | Files | Notes |
|---|---|---|
| Channel definition | `src/db/schema.ts:534-543` (pgEnum), `src/server/actions/campaigns.ts:30-39`, `src/lib/agents/campaign/planner.ts:6-15` | Three Zod copies of the enum that need to be updated together. The DB enum is the riskiest — switching to TEXT means losing FK-style integrity but unlocks user-customisable channels. |
| Asset shape | `src/db/schema.ts:1071-1107` (`campaign_asset`) | `content` is a single text column today. Either: (a) add a sibling `components: jsonb` column (recommended); or (b) replace `content` with `components`. Option (a) keeps existing campaigns viewable without backfill — option (b) needs a backfill. Recommend (a). |
| Generation flow | `src/lib/agents/campaign/orchestrator.ts:85-116`, `src/lib/agents/copywriter/drafter.ts` | Drafter currently takes a free-form `channel: string` and generates a single block of copy. New flow: drafter receives the channel's component schema and outputs a labelled multi-section response (one per component). |
| UI | `src/components/campaigns/asset-card.tsx:35-47` | Single `<article>` with one body. New: render component grid with each component's label + content. |
| Settings | (new) `src/app/(app)/settings/channels/page.tsx`, `src/components/settings/channels-editor.tsx` | Sortable list per channel, drag-handle reorder, add/remove component, per-component prompt override. Pattern can mirror the existing `model-defaults-form.tsx`. |

## Recommended migration approach (low-risk path)

1. **New table** `channel_definition` (workspace-scoped, JSONB component
   array). Pre-seeded with default schemas for `email-marketing`,
   `email-transactional`, `ig-post`, `ig-story`, `fb-ad`, `blog`,
   `landing-hero`, `sms`, `push` on workspace creation. Keep the existing
   `channel` enum for now to avoid breaking the agent_run brief schema.
2. **Add** `campaign_asset.components: jsonb` (nullable). Old rows stay
   readable; new rows write the components map.
3. **Backfill** lazily in `asset-card.tsx`: if `components` is null, render
   the legacy `content` column unchanged. New campaigns generate components.
4. **Drafter prompt update**: when the channel has a component schema,
   inject "Output the following labelled sections..." instead of "Output
   the copy". Parse model output by section header (mirror
   `parseVoiceCardMarkdown` pattern for resilience across small models).
5. **Settings UI**: drag-reorder via `@dnd-kit/sortable` (already in
   tree if shadcn dnd was added; check `pnpm-lock`). Per-component prompt
   override stored on the schema row.

## What to watch

- **Existing campaigns must keep working**. The proposed sibling-column
  approach guarantees this; switching the `content` column shape would
  require a backfill that's mechanical but error-prone.
- **The planner step** also references channel; verify the planner's
  output schema doesn't need to change. (Planner emits angle-per-asset
  metadata that's channel-agnostic, so likely no change.)
- **Manual library exemplars** (V2.4, this batch) filter by `channel`.
  Once channels become user-customisable, exemplars saved against
  legacy channel names ("email") need to either: (a) auto-map to the
  new default schema with the same id, or (b) be re-saved by the user.
  Pick (a) — keep the legacy `channel` enum strings as the canonical
  identifier even when the schema is user-editable.

## Estimated cost

- Schema + migration: ½ day
- Drafter prompt + parser: ½ day
- Settings UI (drag-reorder, per-component prompt override): ½ day
- Asset card rendering refactor + backward-compat: ¼ day
- Testing + edge cases (empty schemas, malformed model output): ¼ day

**Total: ~2 days.** Recommend a dedicated RC (`v2.4.0-rc.1`) so the
schema migration ships under its own version and the rollback story is
clean.
