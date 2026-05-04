# OpenCopy — Plan & Roadmap

> Single source of truth for what's shipped, what's next, and how we get there. Replaces the previous `docs/UX_REORG_PLAN.md` and the inline Roadmap section that used to live in `README.md`.

---

## 1. Version timeline

| Version | Status | Theme |
|---|---|---|
| V0.1 | ✅ shipped | Scaffold + auth + multi-tenant data model + OpenRouter |
| V0.2 | ✅ shipped | Brand voice primitive + agent core |
| V1.0 | ✅ shipped | Copywriter + Localizer agents |
| V1.1 | ✅ shipped | Long-form editor + inline AI commands |
| V1.2 | ✅ shipped | Knowledge base (pgvector) |
| V1.3 | ✅ shipped | Chat assistant |
| V1.4 | ✅ shipped | Campaigns (multi-asset orchestration) |
| V1.5 | ✅ shipped | Direct providers + Ollama + cost dashboard |
| V1.6 | ✅ shipped | Workspaces + invitations + member management |
| V1.7 | ✅ shipped | Exports (MD / HTML / DOCX) + Resend invitation email |
| V1.8 | next | Browser extension (Chrome / Firefox MV3) |
| V1.9 | planned | Helm + Coolify / Dokploy + public docs site |
| V2.0 | planned | REST API + webhooks + admin + i18n |

---

## 2. UX reorganization (eight phases)

> Goal: rebuild the IA around how a marketing team thinks (Brand → Work → Compose → Admin) instead of how the codebase grew. Ship lowest-risk first. Every phase is independently shippable; if we stop after Phase 3 the product is already meaningfully better.

### Mental model we're designing for

A marketer's daily flow:

1. **"Who are we?"** — brand voice + knowledge (configured rarely, the rails)
2. **"What are we shipping?"** — campaign / asset (the unit of work)
3. **"Help me draft this"** — pick a tool: brief / long-form / chat
4. **"Where's the approved version?"** — Library (the canonical archive)
5. **"What did we spend?"** — usage / budget

The current sidebar puts all five layers as peers. We're regrouping them.

### Phase 1 — Punch list (low risk, quick wins) · ~1 day · ✅ shipped

No architectural changes. Each fix is independently mergeable.

| # | Change | Files |
|---|---|---|
| 1.1 | Wire the Library Copy button (was a stub admitting "Copy via run page") | `src/app/(app)/library/page.tsx`; new `library-copy-button.tsx` client component |
| 1.2 | Add `Save to library` on Localizer outputs (parity with Copywriter) | `src/components/agents/localizer-result.tsx`, `src/server/actions/agents.ts` |
| 1.3 | Add Knowledge / Campaigns / Documents / Chat to CmdK navigation | `src/components/shell/command-palette.tsx` |
| 1.4 | Pass `pageTitle` from each route, render breadcrumbs in `Topbar` | `src/components/shell/topbar.tsx`, all `(app)/**/page.tsx` |
| 1.5 | Add "Used by N runs / N campaigns / N threads" backlinks on Voice and Knowledge detail | `src/app/(app)/voices/[id]/page.tsx`, `src/app/(app)/knowledge/[id]/page.tsx` + new server queries |
| 1.6 | Dashboard: collapse onboarding checklist to a banner once ≥3/5 complete; add daily widgets (active campaigns, recent saves, voice last-audit, spend pill) | `src/app/(app)/page.tsx` |
| 1.7 | Move Usage to sidebar footer (peer of Settings) so spend is glanceable | `src/components/shell/sidebar.tsx` |

**Acceptance:** `pnpm typecheck` clean, `pnpm lint` clean, dev-server walkthrough confirms no regressions on hot paths (run an agent, save a variant, switch theme, navigate via CmdK).

### Phase 2 — Sidebar IA + breadcrumb wayfinding · ~0.5 day

No behavior change yet — just regrouping nav and finishing wayfinding.

- Regroup sidebar into four sections with subtle group headers:
  ```
  BRAND      Voices · Knowledge
  WORK       Campaigns · Library
  COMPOSE    Copywriter · Localizer · Long-form · Chat
  (footer)   Usage · Settings
  ```
- Default landing route stays `/` (dashboard) but dashboard now feels useful.
- Replace hand-rolled `← Back` links with consistent breadcrumbs from Topbar (uses Phase 1.4 plumbing).
- Visual polish: muted group headers, slight indent for items, no extra height cost.

**Acceptance:** every page renders breadcrumbs `Workspace ▸ Section ▸ Page`. No removed routes. Sidebar still ≤ 56px wide on collapse.

### Phase 3 — Library as the spine of output management · 2–3 days

Library becomes the answer to "where's the approved copy?"

- Standardize a `SavedVariant` model that any surface (Copywriter, Localizer, Campaign asset, Chat, Document selection) can write to. Carries: voice, locale, channel, audit score, source brief, source surface (run/campaign/chat/document), workspace, savedAt.
- Add `Save to library` action everywhere — including Chat messages and Document selections (highlight → bubble action).
- Library page: filter chips (voice / locale / channel / surface / score range), batch select (copy all, export, archive, regenerate), inline preview, link back to source run/campaign/thread.
- Export formats: Markdown, CSV, JSON. Per-variant + bulk.

**Acceptance:** I can save copy from any of {Copywriter run, Localizer run, Campaign asset, Chat message, Document selection}, find it in Library, filter by voice + locale, export 12 selected variants as Markdown.

### Phase 4 — Unified Compose context bar · 1–2 days

One component for voice + knowledge attachment, used identically across every Compose surface.

- Build `<ComposeContextBar voice knowledge required readOnly>` — always renders the same way.
- Replace per-surface attachment patterns in: Copywriter form, Localizer form, Campaign brief, Chat thread, Document toolbar.
- Make voice attachment **required everywhere by default** with an explicit `Translate without voice` opt-out on Localizer (the only surface where this makes sense). Removes the implicit-vs-explicit ambiguity flagged in the audit.
- Knowledge becomes attachable on all Compose surfaces (currently missing from Localizer + Documents).

**Acceptance:** the same context bar component appears on Copywriter, Localizer, Campaign new, Chat thread, Document editor — same pixels, same behavior.

### Phase 5 — Unified `+ New` entry · 1 day

One button at the top of the sidebar, replaces four separate entry points.

- `+ New` opens a sheet asking *"What are you making?"* with four cards:
  - **Single asset** → routes to brief form (Copywriter)
  - **Campaign** → routes to campaign brief
  - **Long-form** → routes to new Document
  - **Brainstorm** → routes to new Chat thread
- Each card shows a one-line description and an example.
- Pre-attaches voice + knowledge to the destination if user picks them in the sheet first.

**Acceptance:** any compose flow starts from the same sidebar button. Voice + knowledge selection in the sheet flows through to the destination.

### Phase 6 — Run timeline drawer + step-level metrics · 2 days

The agent timeline today is a sticky sidebar; once a run finishes, it goes inert. We want a richer post-mortem view.

- Convert `agent-timeline.tsx` to a right-side drawer.
- During live runs: drawer auto-opens, status pulses, draft-card stream-in stays.
- After completion: drawer collapses to a tab; opening reveals step-level metrics (model used, input/output tokens, latency, cost, retries).
- Add `Re-run with same brief` and `Replay timeline` actions.

**Acceptance:** I can compare two runs side-by-side and see why one was slower / more expensive / produced a higher audit score.

### Phase 7 — Real CmdK content search · 1–2 days

Today CmdK is a navigator pretending to be search.

- Server-side search index (drizzle-built; trigram + ilike fallback, no external service): voices by name, knowledge sources by name + tags, campaigns by name + objective, runs by brief snippet, saved variants by content snippet.
- CmdK shows result types (icon, title, snippet, breadcrumb), keyboard navigation, recent results, fuzzy matching.

**Acceptance:** typing `q3 launch` finds the campaign, the related runs, and the saved variants — with click-through to each.

### Phase 8 (optional / bold) — Compose unification

The strongest IA move: collapse Copywriter / Long-form / Chat into a single **Compose** surface with three modes (brief → variants, blank canvas, conversation). Same context bar, same output destination, same save behavior. Localizer stays separate (it's a different task — transcreation, not generation).

**Tradeoff:** higher engineering cost. Chat-as-distinct-mental-model has defenders. Recommended only after Phases 3–4 are settled, because the Library + ComposeContextBar foundations make this restructure mechanical instead of risky.

If we don't ship Phase 8, that's fine — Phases 1–7 already deliver a much better marketing-team experience.

### Phase ordering rationale

| Order | Why |
|---|---|
| 1 first | Visible polish, builds momentum, no architectural risk |
| 2 next | IA regroup is meaningful but cheap; needs Phase 1 breadcrumbs as foundation |
| 3 before 4 | Library data model unblocks Save buttons in Phase 4 |
| 4 before 5 | `+ New` sheet pre-attaches via the ContextBar built in Phase 4 |
| 6 anytime after 1 | Independent of IA; can slot in based on capacity |
| 7 anytime after 3 | Search benefits from a populated Library |
| 8 last | High-risk, optional — only viable on top of 3+4 |

### Status tracking

- [x] Phase 1 — quick-win punch list (commit `c35f78d`)
- [ ] Phase 2 — sidebar IA + breadcrumb wayfinding
- [ ] Phase 3 — Library as the spine
- [ ] Phase 4 — unified Compose context bar
- [ ] Phase 5 — unified `+ New` entry
- [ ] Phase 6 — run timeline drawer + step metrics
- [ ] Phase 7 — real CmdK content search
- [ ] Phase 8 — Compose unification (optional)

---

## 3. Out of scope (intentional, won't change without a deliberate ask)

- Mobile redesign — desktop-first by design (marketing-team workflow)
- Theming / palette changes — locked: cream + ink + terracotta
- Replacing shadcn primitives — we extend, not rewrite
- Multi-region active-active write topology — single primary region per workspace is enough for v1

---

## 4. Inline TODOs worth surfacing here

These are stale comments in the code that reference features as "lands in V1.x" but the version they pointed at already shipped or scope changed. Cleanup is a 10-min PR — surfaced here so they don't get lost:

- `src/app/(app)/settings/workspace/page.tsx` — three "lands in V1.6" / "Editing lands in V1.6" copy bits (V1.6 shipped invitations + member management; the page hasn't been updated to reflect that).
- `src/components/knowledge/new-source-dialog.tsx:151` — "PDF / file uploads land in V1.5" — V1.5 was provider polish, file uploads remain unscheduled.
- `src/app/(app)/settings/usage/page.tsx:225` — "tracked here yet — that lands in V1.6" — same situation.
