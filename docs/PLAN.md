# OpenCopy — Plan & Roadmap

> Single source of truth for what's shipped, what's next, and how we get there.

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
| **V1.8** | **next** | **Native installer wizard** (Tauri shell + bundled Postgres) |
| **V1.9** | **planned** | **Workspace export / import** (single-file `.opencopy` package) |
| **V2.0** | **planned** | **Guided-tour onboarding** (`react-joyride`, replayable) |

Each of V1.8–V2.0 is detailed below.

---

## 2. V1.8 — Native installer wizard · ~5–7 days

**Goal.** Download one signed installer (`.dmg` for macOS, `.exe` for Windows), double-click, and have OpenCopy running locally in 60 seconds with zero terminal interaction. Fully local, fully self-contained.

### Approach

- **Tauri** (Rust shell) wrapping the Next.js standalone build.
  - Cross-platform: macOS Universal (Apple Silicon + Intel), Windows, Linux AppImage
  - Installer ~15 MB (vs Electron's 80 MB+)
  - System-tray icon — running state, "Open OpenCopy", "Restart", "Quit"
  - Signature-verified auto-updates baked in via Tauri's updater
  - Smaller download → faster install → more user trust on the first impression
- **Embedded Postgres + pgvector**, shipped per-platform. No Docker, no Neon account, no external network. The bundled binary lives in `~/Library/Application Support/OpenCopy/data` (macOS) or `%APPDATA%\OpenCopy\data` (Windows). Each install owns its database.
- **First-run wizard inside the Tauri shell**:
  1. Welcome + license acceptance
  2. Pick install location (sane default)
  3. Auto-generates `AUTH_SECRET` + `ENCRYPTION_KEY`
  4. Boots embedded Postgres on a random local port
  5. Applies migrations (`drizzle-kit migrate`)
  6. Opens the dashboard in default browser
  7. Tray icon stays resident; quitting from the tray cleanly stops Postgres
- **Code-signed + notarized** — Apple Developer cert ($99/yr) for macOS Gatekeeper, Windows code-signing cert ($300/yr) for SmartScreen. Without these, users see scary warnings on first run.

### Sub-tasks

| # | Task | Est. |
|---|---|---|
| 1.1 | Tauri shell skeleton + system tray + window management | 1d |
| 1.2 | Embedded Postgres + pgvector bundle (per-platform precompiled binaries) | 2d |
| 1.3 | First-run wizard UI inside the Tauri shell | 1d |
| 1.4 | Auto-update channel (Tauri updater + GitHub Releases as the artifact host) | 0.5d |
| 1.5 | macOS notarization pipeline + Windows signing | 1d |
| 1.6 | Release-artifact CI: builds `.dmg`, `.exe`, `.AppImage` from a single tag | 0.5d |

### Out of scope (V1.8)

- Linux beyond AppImage (deb/rpm packages later)
- Auto-launch on system boot (toggle later)
- Mobile / iPad
- User-customizable local port / install path beyond the wizard's defaults

### Acceptance

A new user downloads `OpenCopy-1.8.0.dmg`, drags it to Applications, opens it, waits ~30 seconds. Browser opens at the dashboard. No terminal, no `pnpm`, no `.env`, no Postgres setup. Quitting from the tray stops Postgres cleanly.

---

## 3. V1.9 — Workspace export / import · ~3.5–4 days

**Goal.** Any owner can export their entire workspace to a single file and a teammate with the app installed can import it and have everything ready to use. MVP of multiplayer — async sharing, no live cursors yet.

### Approach

- **Export format** — single zip with the extension `.opencopy`:
  ```
  manifest.json          schema version, source metadata, export timestamp,
                         table list, includes_embeddings: bool, encrypted: bool
  tables/*.jsonl         one file per table, newline-delimited JSON rows
  embeddings/chunks.bin  pgvector blobs preserved verbatim (only when included)
  README.txt             human-readable summary
  ```
- **Single file, optional embeddings via checkbox** at export time:
  - Default ON → file is larger but KB search works immediately on import
  - Unchecked → smaller file; importer can recompute embeddings using their own OpenAI key (one-click), or import a companion `.opencopy` later
- **Encrypted exports** — passphrase prompt at export. Key derived via PBKDF2-SHA-256 (300k iterations); zip contents encrypted with AES-256-GCM. The same passphrase is required to import. The `manifest.json` reveals only that the file is encrypted, not the workspace name. ~0.5 day on top of the unencrypted base.
- **What's included**: workspace meta, brand voices + samples + audits, knowledge sources + chunks (+ optional embeddings), agent runs + steps + variants, documents, chat threads + messages, campaigns + assets, library entries.
- **What's NOT included** (intentional):
  - **API keys** — security; importer re-enters them. *(V2 may add an "include encrypted API keys via passphrase" toggle.)*
  - **Member rows as memberships** — exported as email *labels* only. Importer becomes the sole owner of the imported workspace; can re-invite teammates.
  - **Auth state / sessions** — auth is per-install.
- **Import flow**:
  1. `Settings → Workspace → Import` → file picker
  2. App reads `manifest.json`, validates schema version, prompts for passphrase if encrypted
  3. Preview screen: "About to import 'Acme Marketing' — 12 voices, 47 KB sources, 230 runs, embeddings: yes (44 MB). Continue?"
  4. Generates new UUIDs everywhere; foreign keys rewritten in transactional pass
  5. Embeddings copied verbatim (dimension match enforced)
  6. Importer becomes owner of the new workspace; lands on the workspace dashboard

### Sub-tasks

| # | Task | Est. |
|---|---|---|
| 2.1 | Manifest schema + file format spec | 0.5d |
| 2.2 | Server-side exporter — streams zip to client, embeddings toggle, passphrase encryption | 1.5d |
| 2.3 | Server-side importer — passphrase decryption, transactional insert with id rewriting | 1.5d |
| 2.4 | UI: export dialog (toggle + passphrase) + import dialog (preview + passphrase) | 1d |

### Out of scope (V1.9)

- Real-time multiplayer — live cursors, Yjs/Hocuspocus, presence avatars
- Shared identity / cross-install accounts
- Workspace version history / diff / merge
- Companion-file imports for embeddings independently of a workspace import (deferred — checkbox handles 95% of cases)
- Including encrypted API keys (V2)

### Acceptance

I export from install A with embeddings checked + passphrase set → send the `.opencopy` file to a teammate over any channel → they import on install B, enter the passphrase, click through the preview → they see every voice, KB source, run, variant, document, campaign I had, with embeddings intact, ready to run agents.

---

## 4. V2.0 — Guided-tour onboarding · ~2.5–3 days

**Goal.** First-run experience that walks new users through every meaningful surface, replayable any time from a "Take guided tour" button. Polish layer that pays off when V1.8/V1.9 brings real new users in.

### Approach

- **Library**: [`react-joyride`](https://github.com/gilbarbara/react-joyride). React-native, JSX-rich tooltips so the tour feels like part of the app (Geist font, terracotta accent, our `<Badge>` for keyboard hints, etc.) rather than a generic third-party overlay.
- **Two tour shapes**:
  - **First-run tour** — auto-fires after the very first sign-in. ~10 steps across the app:
    1. Welcome to OpenCopy
    2. Create your first brand voice
    3. Paste an OpenRouter key in Settings → AI Providers
    4. Run your first Copywriter agent
    5. Audit the variants
    6. Save your favorite to the Library
    7. Try the Localizer
    8. Optional: knowledge base, documents, chat
    9. Workspace settings + invitations
    10. "You're set — explore from here"
  - **Per-surface mini-tours** — each major surface (Voices, Agents, Knowledge, Campaigns, Library, Documents, Chat) has a small `?` button in its header that launches a 3–5 step tour scoped just to that surface.
- **State** — new column `user_prefs.tours_completed JSONB`:
  ```json
  { "first_run": true, "voices": false, "agents": true, ... }
  ```
  Per-user, persisted in Postgres; survives sign-out and reinstall (since it lives in the local DB).
- **"Take guided tour" entry points**:
  - User menu (top-right dropdown) → "Take guided tour" → opens a chooser of available tours
  - Per-surface `?` button on each surface header → replays just that surface's tour
- **Accessibility** — keyboard navigation, screen-reader labels, prominent **Skip tour** on every step.

### Sub-tasks

| # | Task | Est. |
|---|---|---|
| 3.1 | Tour primitives + `tours_completed` schema migration + add-on to `userPrefs` server actions | 0.5d |
| 3.2 | First-run tour content (~10 steps end-to-end) | 1d |
| 3.3 | Per-surface mini-tours (5 surfaces × ~4 steps each) | 1d |
| 3.4 | "Take guided tour" UI (user menu + surface `?` buttons + tour chooser) | 0.5d |

### Out of scope (V2.0)

- Role-specific tours (admin vs editor vs viewer) — same content for everyone in V1
- Video walkthroughs
- Interactive tutorials that require the user to actually click (read-and-next is enough for V1)
- Localized tour copy beyond EN — pairs with a broader future i18n track

### Acceptance

Brand-new user signs in for the first time → guided tour pops up → walks through all key surfaces in ~2 minutes → user dismisses → next day clicks "Take guided tour" in the user menu → same tour replays from step 1. Voices `?` button replays just the Voices mini-tour without redoing the welcome.

---

## 5. UX reorganization — parallel track (eight phases)

> Goal: rebuild the IA around how a marketing team thinks (Brand → Work → Compose → Admin) instead of how the codebase grew. Independent of the V1.8–V2.0 platform work above; each phase is shippable on its own. Phase 1 already shipped at commit `c35f78d`.

### Mental model

A marketer's daily flow:
1. **"Who are we?"** — brand voice + knowledge (configured rarely, the rails)
2. **"What are we shipping?"** — campaign / asset (the unit of work)
3. **"Help me draft this"** — pick a tool: brief / long-form / chat
4. **"Where's the approved version?"** — Library (the canonical archive)
5. **"What did we spend?"** — usage / budget

The current sidebar puts all five layers as peers. We're regrouping them.

### Phases

#### Phase 1 — Quick-win punch list · ~1 day · ✅ shipped (`c35f78d`)

Library Copy button wired, Save-to-library on Localizer, CmdK navigation parity, breadcrumbs in Topbar, voice/knowledge backlinks, dashboard widgets, Usage in sidebar footer.

#### Phase 2 — Sidebar IA + breadcrumb wayfinding · ~0.5 day

Regroup sidebar:
```
BRAND      Voices · Knowledge
WORK       Campaigns · Library
COMPOSE    Copywriter · Localizer · Long-form · Chat
(footer)   Usage · Settings
```
Subtle group headers; replace hand-rolled `← Back` links with consistent breadcrumbs (uses Phase 1 plumbing). No removed routes.

#### Phase 3 — Library as the spine of output management · 2–3 days

Standardize a `SavedVariant` model usable from any surface. Add `Save to library` action everywhere — including Chat messages and Document selections (highlight → bubble action). Library page gets filter chips, batch select, inline preview, link-back to source. Export formats: Markdown, CSV, JSON.

#### Phase 4 — Unified Compose context bar · 1–2 days

One `<ComposeContextBar voice knowledge required readOnly>` component, used identically on Copywriter form, Localizer form, Campaign brief, Chat thread, Document toolbar. Voice attachment required by default with explicit `Translate without voice` opt-out only on Localizer. Knowledge becomes attachable on every Compose surface.

#### Phase 5 — Unified `+ New` entry · 1 day

One `+ New` button at the top of the sidebar replaces four separate entry points. Opens a sheet asking *"What are you making?"* with four cards: Single asset / Campaign / Long-form / Brainstorm. Pre-attaches voice + knowledge to the destination if user picks them in the sheet first.

#### Phase 6 — Run timeline drawer + step-level metrics · 2 days

Convert `agent-timeline.tsx` to a right-side drawer. During live runs: drawer auto-opens, status pulses, draft-card stream-in. After completion: drawer collapses to a tab; opening reveals step-level metrics (model used, input/output tokens, latency, cost, retries). Add `Re-run with same brief` and `Replay timeline` actions.

#### Phase 7 — Real CmdK content search · 1–2 days

Server-side search index (Drizzle-built, trigram + ilike fallback, no external service). Voices by name, knowledge sources by name + tags, campaigns by name + objective, runs by brief snippet, saved variants by content snippet. CmdK shows result types with icon + title + snippet + breadcrumb, keyboard navigation, recent results, fuzzy matching.

#### Phase 8 (optional / bold) — Compose unification

Collapse Copywriter / Long-form / Chat into a single **Compose** surface with three modes (brief → variants, blank canvas, conversation). Same context bar, same output destination, same save behavior. Localizer stays separate (transcreation, not generation). Recommended only after Phases 3–4 land.

### Phase ordering rationale

| Order | Why |
|---|---|
| 1 first | ✅ shipped — visible polish, no architectural risk |
| 2 next | IA regroup is meaningful but cheap; needs Phase 1 breadcrumbs |
| 3 before 4 | Library data model unblocks Save buttons in Phase 4 |
| 4 before 5 | `+ New` sheet pre-attaches via the ContextBar built in Phase 4 |
| 6 anytime after 1 | Independent of IA; slot in based on capacity |
| 7 anytime after 3 | Search benefits from a populated Library |
| 8 last | High-risk, optional — only viable on top of 3+4 |

### UX phase status

- [x] Phase 1 — quick-win punch list (commit `c35f78d`)
- [ ] Phase 2 — sidebar IA + breadcrumb wayfinding
- [ ] Phase 3 — Library as the spine
- [ ] Phase 4 — unified Compose context bar
- [ ] Phase 5 — unified `+ New` entry
- [ ] Phase 6 — run timeline drawer + step metrics
- [ ] Phase 7 — real CmdK content search
- [ ] Phase 8 — Compose unification (optional)

---

## 6. Out of scope (intentional, won't change without a deliberate ask)

- Mobile redesign — desktop-first by design (marketing-team workflow)
- Theming / palette changes — locked: cream + ink + terracotta
- Replacing shadcn primitives — we extend, not rewrite
- Multi-region active-active write topology — single primary region per workspace is enough
- Browser extension (was floated for V1.8 in earlier drafts; superseded by the installer)
- Helm chart / Coolify / Dokploy templates (was V1.9; reconsider only if installer adoption signals demand)
- REST API + webhooks + admin (was V2.0; reconsider after V2.0 onboarding work proves the surface area is stable)
- Real-time multiplayer (live cursors, Yjs/Hocuspocus, presence) — V1.9 sharing is async-only

---

## 7. Inline TODOs worth surfacing here

Stale comments in code referencing features as "lands in V1.x" but the version they point at already shipped or scope changed. ~10 min cleanup PR — listed here so they don't get lost:

- `src/app/(app)/settings/workspace/page.tsx` — three "lands in V1.6" / "Editing lands in V1.6" copy bits (V1.6 shipped invitations + member management; the page hasn't been updated to reflect that).
- `src/components/knowledge/new-source-dialog.tsx:151` — "PDF / file uploads land in V1.5" — V1.5 was provider polish; file uploads remain unscheduled.
- `src/app/(app)/settings/usage/page.tsx:225` — "tracked here yet — that lands in V1.6" — same situation.
