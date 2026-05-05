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
| V1.8 | ✅ shipped | Native installer (Tauri shell + Node sidecar + PGlite) |
| V1.9 | ✅ shipped | Workspace export / import (single-file `.opencopy`) |
| V2.0 | ✅ shipped | Guided-tour onboarding (`react-joyride`, replayable) |
| **V2.1** | **next** | **Library polymorphism** — `library_entries`, save chat / doc selections, batch select |
| V2.2 | planned | Unified Compose context bar (UX Phase 4) |
| V2.3 | planned | Unified `+ New` entry (UX Phase 5) |
| V2.4 | planned | Run timeline drawer + step metrics (UX Phase 6) |
| V2.5 | planned | Real CmdK content search (UX Phase 7) |

V2.x details for shipped releases live below; planned ones are summarised in [§ 5. UX reorganization track](#5-ux-reorganization--parallel-track).

---

## 2. V1.8 — Native installer · ✅ shipped

Distribution artefact: `OpenCopy_<version>_x64-setup.exe` (Windows NSIS, ~80 MB), `.msi` (Windows Group-Policy variant), `OpenCopy_<version>_aarch64.dmg` (Apple Silicon, ~130 MB). Built by GitHub Actions matrix on every `v*` tag and uploaded to a draft Release.

### Architecture (as actually shipped)

- **Tauri 2.x shell** (`src-tauri/`) wrapping a bundled Node 20 sidecar that runs the Next.js standalone server. Tray icon with **Open / Restart / Quit**. The Tauri webview is currently a small "OpenCopy is starting…" splash; the actual app loads in the user's default browser at `http://127.0.0.1:<random-port>`.
- **PGlite** (`@electric-sql/pglite` + pgvector) replaces native Postgres binaries — Postgres compiled to WASM, runs in-process inside Node, persists under `<app_data>/pgdata/`. Cuts the installer ~3× vs shipping native binaries per platform and removes the per-platform pgvector compile entirely.
- **First-run bootstrap** (`src-tauri/src/secrets.rs`): Rust generates `AUTH_SECRET` + `ENCRYPTION_KEY` into `<app_data>/secrets.env`, persisted across launches. Migrations run via a separate Node script (`migrate.mjs`) spawned before the main server — keeps the drizzle migrator out of webpack's hands.
- **GH Actions matrix** — `windows-latest` + `macos-14` (Apple Silicon). `macos-13` (Intel) was tried and dropped: free-tier private repos get queue-starved on the Intel runner (rc.3 sat queued for 9+ hours). Intel users on modern Macs are < 5%; revisit only if a colleague reports needing it.
- **Unsigned**. Apple Developer ($99/yr) and Windows code-signing ($300/yr) certs intentionally skipped to keep distribution free. Colleagues click through Gatekeeper / SmartScreen warnings once on first launch. Flow documented in README.

### What changed vs the original V1.8 draft

| Original plan | Shipped instead | Reason |
|---|---|---|
| Native Postgres + pgvector binaries per platform | PGlite (WASM) | ~3× smaller installer, no per-platform pgvector compile, single dep tree |
| Code-signed + notarized | Unsigned | Free distribution; colleagues click through OS warning once |
| Wizard *inside* Tauri shell | App opens in default browser; Rust does silent secret gen | Less UI to maintain; Tauri shell stays minimal |
| AppImage for Linux | Skipped | No Linux colleagues yet — revisit on demand |
| Auto-update via Tauri updater | Deferred to V2.x | Tauri updater wants signed builds |

### Security pass (committed alongside V1.8)

- **drizzle-orm 0.38 → 0.45.2** — closes HIGH SQL-injection-via-unescaped-identifiers (GHSA-gpj5-g38j-94v9).
- **next-auth beta.25 → beta.31** — closes magic-link email-misdelivery (GHSA-5jpx-9hw9-2fx4).
- **`postcss ^8.5.10` pnpm override** — closes XSS-via-unescaped-`</style>` in transitively-bundled postcss.
- **Node sidecar SHA256 verification** in `scripts/download-node.mjs` — fetches `SHASUMS256.txt` from nodejs.org and aborts on mismatch. Closes "compromised mirror over valid TLS" supply-chain hole.
- **SLSA build provenance** via `actions/attest-build-provenance@v2`. Currently a no-op on the private repo (free-tier limitation; step is `continue-on-error`); will start persisting attestations automatically when the repo flips public.

Two remaining low/moderate CVEs (`jsondiffpatch` XSS via internal-only `HtmlFormatter`, `ai` SDK filetype-bypass on user uploads we don't yet take) require an `ai 4 → 5` major bump — deferred. Both have ~zero practical exposure in our app today.

---

## 3. V1.9 — Workspace export / import · ✅ shipped

Async multiplayer MVP. An owner exports their workspace to a single `.opencopy` file; a teammate imports it on a fresh install and lands as the new workspace's sole owner.

### File format (`src/lib/export/workspace-format.ts`)

- **Unencrypted** = a plain zip. Any unzip tool can open it.
- **Encrypted** = `{header-json}\n` + AES-256-GCM ciphertext of the zip. PBKDF2-SHA-256 (300k iterations) over UTF-8 passphrase + 16-byte random salt → 256-bit key. 12-byte random IV. 16-byte auth tag.
- First byte of the file alone tells the parser the mode (`0x50 'P'` = zip; `0x7B '{'` = encrypted wrapper).

### Inside the zip

- `manifest.json` — schema version, source workspace metadata, table inventory, member email labels (for re-invite hints), embedding model + dimensions
- `tables/<name>.jsonl` — one JSON row per line, 15 workspace-scoped tables
- `embeddings/chunks.bin` — compact binary container (`OCEMB1` magic + dimensions + per-row UUID + float32-LE), only when `includeEmbeddings: true`. ~3× smaller than JSON-of-floats.
- `README.txt` — human-readable summary so the file is self-explaining

### What's NOT included (intentional)

- **API keys** — security; importer re-enters them.
- **Member rows as memberships** — exported as email *labels* only. Importer becomes the sole owner; can re-invite teammates.
- **Auth state / sessions** — auth is per-install.

### Round-trip mechanics

Importer rewrites every UUID via a remap table, walks 15 tables in dependency order in a single transaction, pins user FKs (createdByUserId etc.) to the importer, enforces embedding-dimension match. Smoke test (`scripts/test-workspace-roundtrip.ts`) verifies UUID remap, embedding fidelity within float32 tolerance, importer-as-owner, and pgvector cosine-similarity queries against the imported data.

Wired through `Settings → Workspace → Transfer` card. Dialogs prompt for passphrase only when the file is encrypted (or when one is opted into on export). Preview before commit; switches workspace on success.

---

## 4. V2.0 — Guided-tour onboarding · ✅ shipped

First-run welcome walkthrough plus per-surface mini-tours, all replayable from the user menu's "Guided tours" section.

### Pieces

- Migration `0009` adds `tours_completed jsonb` to `user_prefs` (default `{}`).
- `src/server/actions/tours.ts` — `getToursCompleted` / `markTourCompleted` / `resetTours` server actions.
- `src/lib/tours/definitions.tsx` — 8 tours: `first_run` (11 steps walking the sidebar) + 7 per-surface (`voices`, `knowledge`, `campaigns`, `library`, `documents`, `chat`, `agents`).
- `src/components/tours/tour-runner.tsx` — client wrapper, loads `react-joyride` dynamically (SSR off — pulls DOM APIs eagerly), exposes `useTours()` hook with `startTour` / `resetAll` / `completed`.
- Sidebar nav links carry `data-tour="nav-<href>"` so the welcome can spotlight each surface.
- `AppLayout` reads `tours_completed` once on the server and seeds the runner so the welcome only auto-fires once per user.
- `UserMenu` lists every tour under "Guided tours" — one click replays.

### Deferred to V2.1

- **Per-surface `?` button** in each surface header (currently only the user-menu chooser replays tours).
- **`data-tour` anchors on surface-specific elements** (`voices-new`, `kb-list`, etc.) — sidebar anchors are in place, but the per-surface tours fall back to body-centred tooltips when their target selector isn't found.

---

## 5. UX reorganization — parallel track

> Goal: rebuild the IA around how a marketing team thinks (Brand → Work → Compose → Admin). Each phase is shippable on its own.

### Mental model

A marketer's daily flow:
1. **"Who are we?"** — brand voice + knowledge (configured rarely, the rails)
2. **"What are we shipping?"** — campaign / asset (the unit of work)
3. **"Help me draft this"** — pick a tool: brief / long-form / chat
4. **"Where's the approved version?"** — Library (the canonical archive)
5. **"What did we spend?"** — usage / budget

### Phase status

- [x] **Phase 1 — Quick-win punch list** (`c35f78d`): Library Copy button, Save-to-library on Localizer, CmdK navigation parity, breadcrumbs in Topbar, voice/knowledge backlinks, dashboard widgets, Usage in sidebar footer.
- [x] **Phase 2 — Sidebar IA + breadcrumb consolidation** (`bf639e9`): regrouped into BRAND / WORK / COMPOSE / footer; hand-rolled `← Back` links removed from 10 sub-pages (Topbar breadcrumb is the single source of wayfinding).
- [⚠️] **Phase 3 — Library as the spine** (partial: `82fac50`): filter chips (kind / voice / locale), JSON / CSV / MD exports, `data-tour` anchors. **Deferred to V2.1**: `library_entries` polymorphic table to support saving chat messages and document selections; document-selection bubble action via Tiptap; batch select with bulk export / delete; inline expand-to-preview.
- [ ] **Phase 4 — Unified Compose context bar** (V2.2 candidate): one `<ComposeContextBar voice knowledge required readOnly>` component, used identically on Copywriter form, Localizer form, Campaign brief, Chat thread, Document toolbar.
- [ ] **Phase 5 — Unified `+ New` entry** (V2.3 candidate): one `+ New` button at the top of the sidebar replaces four separate entry points. Opens a sheet asking *"What are you making?"* with cards for Single asset / Campaign / Long-form / Brainstorm. Pre-attaches voice + knowledge to the destination if user picks them in the sheet first.
- [ ] **Phase 6 — Run timeline drawer + step metrics** (V2.4 candidate): convert `agent-timeline.tsx` to a right-side drawer. During live runs auto-opens, status pulses, draft-card stream-in. After completion: drawer collapses to a tab; opening reveals step-level metrics (model used, input/output tokens, latency, cost, retries). Add `Re-run with same brief` and `Replay timeline`.
- [ ] **Phase 7 — Real CmdK content search** (V2.5 candidate): server-side search index (Drizzle-built, trigram + ilike fallback, no external service). Voices by name, knowledge sources by name + tags, campaigns by name + objective, runs by brief snippet, saved variants by content snippet. CmdK shows result types with icon + title + snippet + breadcrumb.
- [ ] **Phase 8 — Compose unification** (optional / bold): collapse Copywriter / Long-form / Chat into a single **Compose** surface with three modes (brief → variants, blank canvas, conversation). Same context bar, same output destination, same save behavior. Localizer stays separate (transcreation, not generation). Recommended only after Phases 3–4 land.

### Phase ordering rationale

| Order | Why |
|---|---|
| 1 ✅ | shipped — visible polish, no architectural risk |
| 2 ✅ | shipped — IA regroup needed Phase 1 breadcrumbs |
| 3 first (V2.1) | Library data model unblocks save-everywhere in Phase 4 |
| 4 next (V2.2) | `+ New` sheet pre-attaches via the ContextBar built in Phase 4 |
| 5 (V2.3) | depends on 4 |
| 6 anytime | independent; slot in based on capacity |
| 7 anytime after 3 | search benefits from a populated Library |
| 8 last | high-risk, optional — only viable on top of 3+4 |

---

## 6. Other tracks worth surfacing (not yet versioned)

These items aren't on the V2.x rail but are explicitly *not* "won't do" — they're queued for a future pass.

### Native-app shell (high priority — promised next session)

Today the Tauri shell is tray-only and the actual UI renders in the user's default browser. Goal: flip the Tauri main window to render the app *inside itself* via WebView2 (Windows) / WKWebView (Mac), so OpenCopy looks/feels like a real desktop app with its own dock/taskbar entry, instead of "an app that opens a browser." All free — no paid certs, no third-party deps, the webview is OS-provided and already bundled.

**Phase 1 — Single-window native app · ~1–2 hours**
- `tauri.conf.json`: flip `app.windows[0].visible: true`, set sensible default size, drop the placeholder `dist/index.html`.
- Rust `setup()`: after `wait_for_server` resolves, navigate the main window to `http://127.0.0.1:<port>` via `webview.navigate()`.
- Tray menu: "Open OpenCopy" focuses the window instead of launching the browser; "Open in browser" stays as a fallback item.
- Remove the auto-`open_url` on first launch.

**Phase 2 — Multi-window · ~2–3 hours**
- Cmd/Ctrl+N "New window" via Tauri menu / global shortcut → spawns a new `WebviewWindow` pointing at the same local URL.
- Window menu (View → New Window, Window → Bring all to front).
- Cookies / login shared across windows (same origin = `127.0.0.1:<port>`).
- Works identically on Windows + macOS.

**Phase 3 — macOS native tabs (optional) · ~3–5 hours**
- On macOS only: `NSWindowTabbingMode` so multiple `WebviewWindow`s merge into a single tabbed window the way Safari / Finder do it. Cmd+T spawns a new tab inside the same window instead of a separate window.
- Windows: not applicable — no native tabbed-window concept. Multi-window from Phase 2 is the Windows answer.

**Out of scope for this track**
- Chrome-style in-app tab bar (custom-rendered tab strip + multiple webviews stacked in one window). Possible (~2 extra days), but most desktop-app users today expect multi-window over in-app tabs (VS Code, Slack, Notion, Linear all work that way).

**Tradeoffs flagged**
- Memory: each window = its own webview process. 4 windows ≈ 4 processes. Same shape as Chrome, fine in practice.
- The Next.js app needs zero changes — same routes, same sessions, just a different client renders them.

---

### Upgrade & install hardening (high priority — burned a colleague-test session on this)

- **NSIS pre-install hook: detect-and-stop running instance.** ~1 hour, cheap, fixes a sharp edge that costs new users the first 10 min of their first try.
  - **Symptom:** Reinstalling over a previous version fails mid-extract with `Error opening file for writing: %LOCALAPPDATA%\OpenCopy\node.exe`. Cause: the old install's bundled Node sidecar is still running and holds a file lock — the Windows uninstaller closes the OpenCopy tray app but doesn't kill its child Node process.
  - **Fix:** custom NSIS hook (`bundle.windows.nsis.installerHooks` in `tauri.conf.json`) that runs before extract:
    1. `FindWindow "OpenCopy"` — close the Tauri shell window if open
    2. Iterate processes for any `node.exe` whose path is under `$INSTDIR` and `nsExec::Exec` a kill
    3. Wait 1–2 seconds for handles to release
    4. Proceed with extract
  - Same hook in the uninstaller would make the issue go away on uninstall too — no orphan node.exe left behind.

- **Tauri auto-update channel** — the proper user-facing upgrade path. ~1 day.
  - User clicks **"Update available"** inside the app → bundle downloads + replaces in-place → app restarts on the new version. No re-running an installer, no clicking through SmartScreen again.
  - Tauri's updater uses its own **Ed25519 update-signing key** (generate locally, `tauri signer generate`, public key baked into the bundle) — *unrelated* to OS code-signing. So this works on free-tier without paying Apple/Microsoft.
  - Update server is just a JSON manifest hosted on GitHub Releases (`latest.json` with version + signed bundle URLs per platform). The `release.yml` workflow needs a step to generate the signed `.tauri.app.tar.gz` artefacts and update the manifest on each tag.
  - Public repo flip + this combined gives colleagues a one-click upgrade with zero terminal work.

### Other items, in roughly priority order

- **Per-surface `?` tour replay buttons** — finishes the V2.0 polish loop; ~2 hours.
- **Per-surface `data-tour` anchors** — makes the V2.0 mini-tours actually point at the right UI elements; ~1 hour per surface.
- **`ai` SDK 4 → 5 major bump** — closes the last 2 (low/moderate) CVEs; hours-of-refactor across many files.
- **OS-level code signing** — Apple Developer cert ($99/yr) + Windows code-signing ($300/yr). Drops the click-through SmartScreen / Gatekeeper warnings on first launch. Independent of the auto-update plumbing above; pure first-impression UX. Worth doing once OpenCopy has actual non-colleague users.
- **macOS Intel runner** — dropped from CI because of free-tier queue starvation. Reintroduce as `continue-on-error: true` in the matrix the moment a colleague reports needing it.
- **Encrypted API-key export toggle** — V1.9 export deliberately strips API keys; a future V2.x option could include them encrypted with the same passphrase.
- **PDF / file uploads to Knowledge** — referenced by a `V1.5` TODO comment but never scheduled; revisit when there's demand.
- **Public repo flip** — currently private; flipping to public unlocks free unlimited CI minutes, SLSA attestations begin persisting automatically, and lets colleagues clone without invite. Pending readiness call.

---

## 7. Out of scope (intentional, won't change without a deliberate ask)

- Mobile redesign — desktop-first by design (marketing-team workflow).
- Theming / palette changes — locked: cream + ink + terracotta.
- Replacing shadcn primitives — we extend, not rewrite.
- Multi-region active-active write topology — single primary region per workspace is enough.
- Browser extension (was floated for V1.8 in earlier drafts; superseded by the installer).
- Helm chart / Coolify / Dokploy templates (was V1.9; reconsider only if installer adoption signals demand).
- REST API + webhooks + admin (was V2.0; reconsider after V2.1 polish proves the surface area is stable).
- Real-time multiplayer (live cursors, Yjs/Hocuspocus, presence) — V1.9 sharing is async-only and that's the design intent.
- Native Postgres + pgvector binaries in the installer — superseded by PGlite. Won't reintroduce unless a workload shows up that PGlite genuinely can't handle.

---

## 8. Inline TODOs worth surfacing here

Stale comments in code referencing features as "lands in V1.x" but the version they point at already shipped or scope changed. ~10 min cleanup PR — listed here so they don't get lost:

- `src/app/(app)/settings/workspace/page.tsx` — three "Editing lands in V1.6" copy bits. The Transfer card (V1.9) was added to this file; the Members copy still says V1.6. Update to remove the stale "lands in" language.
- `src/components/knowledge/new-source-dialog.tsx:151` — "PDF / file uploads land in V1.5" — V1.5 was provider polish; file uploads remain unscheduled. Either remove the promise or schedule the work.
- `src/app/(app)/settings/usage/page.tsx:225` — "tracked here yet — that lands in V1.6" — same situation.
