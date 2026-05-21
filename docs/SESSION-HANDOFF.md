# Session handoff — 2026-05-08

Context dump for starting a fresh Claude Code session. Everything below is
state as of the end of the 2026-05-08 session. Read top to bottom.

---

## TL;DR — what to do first

1. **Promote the rc.4 release** (the one action that's queued and waiting):
   ```
   gh release edit v2.4.0-rc.4 --draft=false --latest=true --prerelease=false
   ```
   This was verified ready (see "Auto-updater" below) but NOT run — it ships
   the update to every installed OpenCopy and the maintainer wanted to confirm
   first. Confirm with the maintainer, then run it.
2. **Merge the feature branches to `master`** — see "Branch state".
3. **Diana's macOS install** is still broken — see "Diana's situation".

---

## Branch state

| Branch | What's on it |
|---|---|
| `master` | Last commit `5a6bd52` (NSIS pre-install hook). None of the session's work is merged here yet. |
| `master-backup` | Safety copy of master. |
| `feature/diana-batch-2026-05-08` | ToV extractor + manual library + AI-providers click fix + CI manifest fix. Tags `v2.3.0-rc.7`, `v2.3.0-rc.8`. |
| `feature/channel-components` | **Superset** — branched off diana-batch, so it contains ALL of the above PLUS V2.4 channel components and all 4 auto-updater fixes. Tags `v2.4.0-rc.1` … `rc.4`. |

**Recommended merge path:** `feature/channel-components` → `master` brings
everything in one go (it's a strict superset of diana-batch). After that,
`feature/diana-batch-2026-05-08` can be deleted without losing anything.
Working tree is clean; both branches are pushed to origin.

Commit log on `feature/channel-components` (newest first):
```
b7190aa fix(ci): manifest builder finds nested updater files + Tauri 2.x exe convention
ac70aac fix(installer): produce updater archives so latest.json is non-empty
bbb57e5 fix(ci): split latest.json platforms object into its own jq call
0f31f2a feat(channels): user-customisable channel components (V2.4)
1a28def fix(ci): unbreak latest.json manifest publish step
a7613e5 docs: scope deferred channel-components refactor
74800fb feat(library): manual reference exemplars (P1)
71ef512 fix(tours): stop welcome overlay from eating clicks (P1)
8772dc5 feat(voices): Tone-of-Voice document extractor (P0)
96c2995 fix(installer): macOS entitlements so V8 sidecar can JIT
f979b6f fix(db): cache PGlite on globalThis unconditionally
```

---

## What shipped this session

### Original bug debugging (runtime fixes)
- **`f979b6f` PGlite chunk-duplication.** `db/client.ts` only cached its client
  on `globalThis` in non-production. The standalone bundler duplicates the
  module across webpack chunks → two PGlite instances on one data dir → writes
  through one chunk invisible to reads through another. Surfaced as "Ollama
  save returns ok but the row never appears" and post-signup `UNAUTHENTICATED`
  loops. Fix: cache unconditionally. Test: `scripts/test-db-client-global-cache.ts`.
- **`96c2995` macOS V8 entitlements.** Bundled Node's V8 couldn't allocate JIT
  memory on Apple Silicon Sequoia → "Failed to reserve virtual memory for
  CodeRange", migrations abort, server never boots. Fix: added
  `src-tauri/entitlements.plist` (`allow-jit` + `allow-unsigned-executable-memory`
  + `disable-library-validation`), referenced from `tauri.conf.json`.

### Diana batch (4 features requested 2026-05-08)
- **#1 `8772dc5` ToV document extractor (P0).** "Import from document" button
  on the brand-voice editor. Paste or upload `.docx`/`.txt`/`.md`. New
  `document-extractor` agent → voice card + locale-tagged signature phrases
  (new `brand_voice.signature_phrases` jsonb column) + KB-content hint. Diff
  preview with per-field accept. `mammoth` added for docx parsing.
- **#2 `74800fb` Manual library exemplars (P1).** Hand-curated human-written
  reference copy. New `library_entry` kind `manual` + `source` enum + `channel`
  column. New `retrieveExemplars` lane feeds the copywriter drafter as STYLE
  references (separate from KB factual grounding). Settings → Library "Add
  manual entry" dialog.
- **#3 `71ef512` AI Providers click bug (P1).** The first-run Joyride tour has
  no `scope`, so its full-viewport overlay rendered on every page and ate all
  clicks. Fix: `overlay.pointerEvents = "none"` + `spotlightClicks`. Test:
  `scripts/test-tour-styles.ts`.
- **#4 `0f31f2a` Channel components (P2).** Per-workspace customisable channel
  schemas. New `channel_definition` table, 8 new channel enum values, nullable
  `campaign_asset.components` jsonb. Drafter produces labelled component
  sections; new `parseMultiComponentDrafterOutput` parser. Settings → Channels
  editor (up/down reorder — drag-and-drop deferred). Asset card renders
  multi-component output with backward-compat. Test:
  `scripts/test-multi-component-drafter-parser.ts`.

### Auto-updater pipeline (option "C")
The release workflow's publish step was broken **four separate ways**, fixed
across rc.5 → rc.2 → rc.3 → rc.4 (see next section). The repo was also flipped
**public** (`gh repo edit --visibility public`) so the
`releases/latest/download/latest.json` updater endpoint is reachable unauthed.
Security audit was clean — no secrets in history, `.gitignore` covers `.env*`.

---

## Auto-updater: the four bugs (so you don't re-debug them)

`.github/workflows/release.yml` → "Build latest.json manifest" / publish step:

1. **jq `as`-in-pipe-head** — `({} as $base) | …` is rejected by jq. Fixed in
   `1a28def`.
2. **jq object-literal RHS** — `platforms: (if…) + (if…)` rejected (`expected
   '}'`). Fixed by building the platforms object in a separate jq call and
   splicing with `--argjson` (`bbb57e5`).
3. **No updater artifacts** — Tauri 2.x defaults `bundle.createUpdaterArtifacts`
   to `false`, so `.app.tar.gz` / signed `.exe` were never produced and
   `latest.json` had `platforms: {}`. Fixed by setting it `true` (`ac70aac`).
4. **Path + filename mismatch** — after `download-artifact merge-multiple`,
   files land one dir deep (`artifacts/macos/…`, `artifacts/nsis/…`); the
   manifest builder's single-level `ls` missed them. Also Tauri 2.x has no
   `.nsis.zip` — the Windows updater uses `-setup.exe` + `-setup.exe.sig`.
   Fixed with `find` + corrected globs (`b7190aa`).

**`v2.4.0-rc.4` is verified good.** Its `latest.json` (1.3 KB) has both
`darwin-aarch64` and `windows-x86_64` entries with non-empty signatures and
valid URLs. The draft release has all 8 expected assets (latest.json, the two
updater archives + `.sig`s, DMG, NSIS exe, MSI + `.sig`s). It's still a
**draft** — promoting it is the pending TL;DR item #1.

Once promoted, any installed OpenCopy from rc.5+ auto-updates on next launch
(the bundled Ed25519 pubkey is stable across all those builds).

---

## Diana's situation (macOS tester)

Diana is on an Apple Silicon Mac (Sequoia). Her last *successful* run was
`server exited: Some(0)` at 2026-05-08 16:07 — so a prior install worked.
She then tried to install a newer build and got stuck:

- `xattr -dr com.apple.quarantine /Applications/OpenCopy.app` → "No such file"
  — **the app was never moved into `/Applications`**. She's launching it from
  Downloads or the mounted DMG, where Gatekeeper blocks hardest. The Gatekeeper
  dialog showed the app named `OpenCopy 19-13-27-994` (a browser
  duplicate-download timestamp suffix).
- Fix given: open the `.dmg`, **drag `OpenCopy.app` into `/Applications`**, then
  `xattr -dr com.apple.quarantine /Applications/OpenCopy.app`, then launch from
  Launchpad. If Gatekeeper still blocks → System Settings → Privacy & Security →
  Open Anyway.

**Best resolution:** once `v2.4.0-rc.4` is promoted to "latest", Diana's
existing (working) OpenCopy auto-updates in place — no download/drag dance.
Recommend promoting first, then telling her to just relaunch her current app.

The macOS first-launch friction is inherent to ad-hoc signing (not notarized).
Permanently removing it needs an Apple Developer ID ($99/yr) + `notarytool` in
CI — a worthwhile separate task, not yet done.

---

## Environment quirks (maintainer is on Windows)

- Claude Code on this Windows machine runs in an MSIX AppContainer sandbox.
  Direct file ops + Bash reach the real disk; `Start-Process` of an `.exe`
  gets sandbox-redirected (`%LOCALAPPDATA%\Packages\Claude_…\LocalCache\…`).
  You cannot launch OpenCopy yourself — ask the maintainer to launch from the
  Start menu.
- Bundled-installer real paths (Windows):
  - `%LOCALAPPDATA%\OpenCopy\` — install dir
  - `%LOCALAPPDATA%\io.opencopy.desktop\logs\OpenCopy.log` — tauri-plugin-log
  - `%APPDATA%\io.opencopy.desktop\secrets.env` — AUTH_SECRET + ENCRYPTION_KEY
  - `%APPDATA%\io.opencopy.desktop\pgdata\` — PGlite store
- macOS log path: `~/Library/Logs/io.opencopy.desktop/OpenCopy.log`.
- `jq` is not installed on the maintainer's Windows shell — CI runners have it.
- GitHub Actions billing was hit (private-repo spend cap) and then resolved;
  public repos get unlimited Actions minutes so this shouldn't recur.

---

## Migrations added this session

`0011_busy_mac_gargan.sql` (signature_phrases), `0012_good_clint_barton.sql`
(library source/channel/metadata), `0013_past_mephistopheles.sql`
(channel_definition table + new channel enum values + campaign_asset.components).
All additive — no data loss. The bundled `migrate.mjs` runs them in order on
first launch.

---

## Open follow-ups (not blocking)

- 6 Dependabot vulnerabilities flagged on the repo (4 moderate, 2 low).
- macOS notarization (kills the Gatekeeper friction permanently).
- Channel components: drag-and-drop reorder was deferred — currently up/down
  buttons. See `docs/scope-channel-components.md`.
- `v2.3.0-rc.7` / `rc.8` tags are now superseded by the `v2.4.0` line; can be
  cleaned up.
- Node 20 actions deprecation warnings in CI (GitHub forcing Node 24 from
  2026-06-02) — bump action versions when convenient.
