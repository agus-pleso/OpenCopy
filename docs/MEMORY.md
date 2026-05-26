# OpenCopy — Engineering Memory

> The mini-details that get lost between sessions. Read this once before touching anything; saves an hour of re-discovery.
>
> Scope: how things actually work + why we made the calls we made. The product roadmap is being reworked from scratch and lives elsewhere when it exists; do not infer it from this file.

---

## 1. Mental model in 60 seconds

OpenCopy is a self-hosted Jasper-AI replica, MIT-licensed, focused on agentic copywriting agents driven by a structured Brand Voice primitive. Two distribution paths:

- **Source / dev**: clone repo → `pnpm install` → `pnpm bootstrap` (interactive setup) → `pnpm dev`. Connects to user-supplied Postgres via `DATABASE_URL`. Most contributors run it this way.
- **Desktop installer**: `OpenCopy_x.y.z_x64-setup.exe` (Windows) / `_aarch64.dmg` (Mac ARM). One file, double-click, app boots in the system tray, browser opens at a random local port. Bundles **Node 20 + Next.js standalone server + PGlite (WASM Postgres)** — fully self-contained, no DB to provision, no terminal.

The agentic engine is plain async-TS over the Vercel AI SDK — no LangGraph / Mastra. Single `Agent` primitive composed into multi-step flows (Copywriter, Localizer, Voice Auditor, etc.). See `src/lib/agents/`.

Stack: **Next.js 15 App Router · TypeScript · Tailwind v4 · shadcn/ui · Drizzle ORM · Postgres (pg) or PGlite · Auth.js v5 · Tauri 2.x · OpenRouter / Anthropic / OpenAI / Google / Mistral / Ollama**.

---

## 2. The dual database backend (the most important runtime split)

The app speaks Postgres in two flavours, switched at runtime by `OPENCOPY_EMBEDDED_DB`:

| Mode | Trigger | Used by | Library | Where data lives |
|---|---|---|---|---|
| External Postgres | unset (default) | Local dev, `pnpm dev`, hosted self-host | `pg` + `drizzle-orm/node-postgres` | `DATABASE_URL` you set |
| Embedded PGlite | `OPENCOPY_EMBEDDED_DB=1` | The Tauri-bundled installer | `@electric-sql/pglite` + `drizzle-orm/pglite` | `OPENCOPY_DATA_DIR` (dir of files) |

**Both adapters share the Drizzle query API.** Call-site code (`db.query.foo.findFirst(...)`) is identical. The `db` export is typed as `NodePgDatabase<typeof schema>` for IntelliSense; both adapters satisfy that surface in practice.

**Implementation lives in `src/db/client.ts`.** Eager static imports (no top-level await — see § 5). The two adapters are listed in `next.config.ts → serverExternalPackages` so neither gets bundled by webpack:

```ts
serverExternalPackages: ["@electric-sql/pglite", "drizzle-orm", "pg"],
```

**Migrations in embedded mode** are NOT run via the Next.js `instrumentation.ts` hook — that path was tried and failed (drizzle's `pglite/migrator` imports `node:fs` etc. which webpack can't bundle). Instead, the Tauri Rust shell spawns a separate Node process running `src-tauri/migrate.mjs` BEFORE the main server boots. That script imports drizzle/pglite/migrator directly, runs against `OPENCOPY_DATA_DIR`, and exits. Pure Node script — no webpack involvement.

**Migrations in dev mode** (external Postgres): `pnpm db:migrate` (uses `tsx src/db/migrate.ts`).

---

## 3. The Tauri installer architecture

Lives under `src-tauri/`. Tauri 2.11.

```
src-tauri/
├── Cargo.toml           # opencopy crate, version mirrors tauri.conf.json
├── tauri.conf.json      # bundle config, identifier=io.opencopy.desktop
├── src/
│   ├── main.rs          # entry, just calls opencopy_lib::run()
│   ├── lib.rs           # tray + sidecar supervisor + window event handling
│   └── secrets.rs       # AUTH_SECRET / ENCRYPTION_KEY first-run gen
├── migrate.mjs          # runs DB migrations BEFORE the Next server starts
├── binaries/            # gitignored — node-<triple> downloaded by script
├── server/              # gitignored — Next standalone build, populated by prepare-server.mjs
├── icons/               # default Tauri icons (replace before public release)
└── capabilities/
    └── default.json     # core:default + opener:allow-open-url for localhost
```

**Boot sequence** (when user launches the installed app):

1. `opencopy.exe` (Tauri shell) starts, registers tray icon.
2. `spawn_server()` in `lib.rs`:
   - Computes path to `<exe-dir>/node.exe` (sidecar bundled there by Tauri's `externalBin`).
   - Computes data dir from `app.path().app_data_dir()` → `%APPDATA%\io.opencopy.desktop` on Windows.
   - Calls `secrets::load_or_generate(&data_root)` — reads or creates `<data>/secrets.env` with `AUTH_SECRET` + `ENCRYPTION_KEY` (32-byte base64 each, generated via `rand::OsRng`).
   - Spawns `node migrate.mjs` synchronously with `OPENCOPY_DATA_DIR` env. Waits for exit. Bails if it fails.
   - Spawns `node server.js` as a sidecar with all the env vars Next + Auth.js need.
   - Pumps stdout/stderr to `tauri-plugin-log` (writes to `%LOCALAPPDATA%\io.opencopy.desktop\logs\OpenCopy.log`).
3. Background task waits for `127.0.0.1:<port>` to bind, then opens system browser via `tauri-plugin-opener`.
4. On exit (tray Quit, app close): `shutdown()` calls `child.kill()` on the Node sidecar. Important — without this, orphan `node.exe` survives in the user's process tree (we hit this; see § 7).

**Tauri scripts in `package.json`:**
- `pnpm tauri:dev` — dev mode (Tauri shell + dev URL). Won't spawn the bundled sidecar (`server/server.js` won't exist); falls back to `http://localhost:3000` and assumes the user has `pnpm dev` running.
- `pnpm tauri:build` — full release build. Runs `pnpm tauri:prepare` first via `beforeBuildCommand`.
- `pnpm tauri:prepare` — `download-node.mjs && prepare-server.mjs`.
- `pnpm tauri:build:debug` — debug build, faster compile, larger binary.

---

## 4. Build pipeline (the part that bit us repeatedly)

`scripts/prepare-server.mjs` is the heart of the bundle. It:

1. Runs `pnpm exec next build` with `NEXT_OUTPUT=standalone`.
2. Copies `.next/standalone/*` → `src-tauri/server/` **with `dereference: true`** (resolves all symlinks during copy — critical, see below).
3. Copies `.next/static` → `src-tauri/server/.next/static`.
4. Copies `public/` → `src-tauri/server/public/`.
5. Copies `drizzle/` (SQL migrations) → `src-tauri/server/drizzle/`.
6. Copies `src-tauri/migrate.mjs` → `src-tauri/server/migrate.mjs`.
7. **Hoists EVERY `.pnpm/<pkg>/node_modules/<pkg>` to `src-tauri/server/node_modules/<pkg>`** (defence-in-depth — see § 5).

**`scripts/download-node.mjs`** downloads stock Node 20.18.0 from `nodejs.org/dist/<v>/`, **verifies SHA256 against `SHASUMS256.txt`**, places at `src-tauri/binaries/node-<target-triple>(.exe)`. Tauri's `externalBin: ["binaries/node"]` auto-resolves the right one per platform. Skipped if the file already exists (set `FORCE=1` to redownload).

**`scripts/test-pglite-migrate.mjs`** — keep on hand. Spins up an ephemeral PGlite, applies all `drizzle/*.sql` migrations, smokes the `vector` extension. First line of defence when adding migrations.

**`scripts/test-workspace-roundtrip.ts`** — workspace export/import end-to-end smoke. Exports an encrypted `.opencopy`, imports into a fresh PGlite, verifies UUID remap + embedding fidelity + pgvector cosine-similarity query against imported data.

---

## 5. The Things That Bit Us (don't repeat these)

Hard-won lessons from the installer + multi-feature push. **All fixed**, but the lessons stick.

### 5.1 Windows + pnpm + Next standalone = symlink EPERM

```
EPERM: operation not permitted, symlink ...node_modules\.pnpm\...
```

`next build --output=standalone` tries to create symlinks under `.next/standalone/node_modules/.pnpm/...`. On Windows, regular users can't create symlinks. **Fix: enable Developer Mode** (`Settings → For developers → Developer Mode → ON`) or run from an elevated shell. CI runners run elevated by default — only hits local Windows builds.

### 5.2 Top-level await breaks tsx-on-CJS

`src/db/client.ts` was originally `await import("...")` for both adapters. tsx (used by `pnpm tsx scripts/foo.ts`) transpiles to CJS by default, and CJS doesn't support top-level await. The smoke test scripts couldn't load the file.

**Fix: use eager static imports** of both adapters; let `next.config.ts → serverExternalPackages` keep them out of the bundle. The cost is a slightly larger bundle; the gain is the file loads under tsx, Node ESM, and webpack equally.

### 5.3 Webpack vs Node-builtin imports

Inside `runtime-bootstrap.ts` (deleted now), I had `import { readdir } from "fs/promises"`. Webpack errored: `Module not found: Can't resolve 'fs/promises'`. The `node:` prefix variant fared no better.

**Fix: don't run drizzle's pglite migrator inside the Next bundle at all.** Move it to a separate Node script (`src-tauri/migrate.mjs`) that the Tauri shell spawns directly. Pure Node, no webpack.

This is also why `serverExternalPackages` includes `drizzle-orm`, `pg`, and `@electric-sql/pglite` — keeps webpack out of native-import territory.

### 5.4 PGlite WASM resource path

PGlite's WASM loader does `fs.readFile(fsBundleUrl)` where `fsBundleUrl` is a `file://` URL. Webpack-bundled, it fails: `Received an instance of URL`.

**Fix: `serverExternalPackages: ["@electric-sql/pglite", ...]`** — keeps PGlite out of webpack entirely. Loaded via Node's standard ESM resolution at runtime; everything works.

### 5.5 pnpm hides Next's runtime peer-deps in `.pnpm/`

`Cannot find module 'styled-jsx/package.json'` (and later: `@swc/helpers`, `@next/env`, `caniuse-lite`, `pg-types`, `client-only`, `postgres-array`, `react-dom/server.browser`, `scheduler`, ...).

Next's runtime calls `require.resolve('xxx')` from deep inside `next/dist/...`. Node's resolution walks up looking for `node_modules/xxx`. pnpm's flat `node_modules/` only contains direct deps as top-level entries — transitive peers live under `.pnpm/...`, invisible to that walk.

**Fix sequence:** kept adding individual packages to a `PEER_DEPS_TO_HOIST` list. Each fix surfaced the next missing one. The whack-a-mole ended with a comprehensive solution in `prepare-server.mjs`:

```js
cpSync(standalone, dest, { recursive: true, dereference: true });
// + for every entry in node_modules/.pnpm/*/node_modules/*:
//   if not already in dest/node_modules, copy with dereference: true
```

Bundle size grew ~50 MB → ~80–100 MB but it Just Works on any install location.

### 5.6 macOS Intel runner queue starvation

`macos-13` (Intel Mac) on free-tier private repos sat in queue 9+ hours. Couldn't get a runner. With `needs: build` on the release-publish job, the whole release was blocked.

**Fix: dropped `macos-13` from the matrix.** Apple Silicon (`macos-14`) covers ~95%+ of modern Mac users. Reintroduce only if a colleague reports needing it, and then use `continue-on-error: true` so it doesn't block the release.

### 5.7 SLSA build provenance not available on private repos

`actions/attest-build-provenance@v2` errors out with `Failed to persist attestation: Feature not available for user-owned private repositories`. Caused the Mac job to fail post-build, which aborted the artifact upload.

**Fix: `continue-on-error: true` on the attestation step.** Builds succeed, attestation logs the error but doesn't block. **Will start working automatically when the repo flips public.**

### 5.8 Artifact-glob path layout depends on `tauri build --target`

`tauri build --target <triple>` puts artifacts at `src-tauri/target/<triple>/release/bundle/...`, not `target/release/bundle/`. Initial workflow used the latter; uploaded zero artifacts.

**Fix:** Each matrix entry's `artifact-glob` includes the triple: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`.

### 5.9 The release-publish glob also needs `**`

`actions/upload-artifact@v4` preserved Windows bundle's nested subdirs (`nsis/`, `msi/`) but flattened Mac's `dmg/` to the top of the artifact zip. So `actions/download-artifact@v4 + merge-multiple: true` produced a tree like:

```
artifacts/
  OpenCopy_*.dmg            ← Mac, top level
  nsis/OpenCopy_*.exe        ← Win, nested
  msi/OpenCopy_*.msi          ← Win, nested
```

Original `softprops/action-gh-release` glob was `artifacts/*.exe` — only matched top-level. Windows installers got dropped from the release.

**Fix:** `artifacts/**/*.exe`, `artifacts/**/*.msi`, `artifacts/**/*.dmg`.

### 5.10 Stale browser session JWT after wiping the embedded DB

Local dev pattern: wipe `.opencopy-data/`, restart `pnpm dev`. Browser still has the session cookie pointing at a `user.id` that no longer exists. Auth.js sees a "valid" session, lets the request through, layout tries `getCurrentWorkspace()` → throws `NO_WORKSPACE` → `redirect("/login")` → `/login` sees a session and redirects back. Loop.

**Fix when it happens:** open incognito or clear `localhost:3000` cookies. **Permanent fix (deferred):** make the layout call `signOut()` via a route handler when the user-id is missing from the DB.

### 5.11 PGlite + leftover postmaster.pid

Killing `pnpm dev` mid-run leaves `.opencopy-data/postmaster.pid`. Next launch: PGlite refuses to open the cluster. WASM `Aborted()` panic.

**Fix:** `Remove-Item -Recurse -Force .opencopy-data` and start fresh. PGlite is *Postgres-compiled-to-WASM* — same lock-file behaviour as a real `postgres` daemon.

### 5.12 Orphan node.exe locks the file on reinstall

The Windows uninstaller closes the OpenCopy tray app, but doesn't kill its child `node.exe` sidecar. The orphan keeps `node.exe` open on disk. New installer fails mid-extract with:

```
Error opening file for writing: %LOCALAPPDATA%\OpenCopy\node.exe
```

**Fix when it happens:**
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.ExecutablePath -like '*OpenCopy*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\OpenCopy"
```

The fix that shipped: NSIS pre-install hook that detects + closes the running instance before extract. See `src-tauri/windows/installer-hooks.nsh`.

---

## 6. Distribution: filesystem map + click-through warnings

### Where things live (Windows)

| Path | What |
|---|---|
| `%LOCALAPPDATA%\OpenCopy\` | install dir — `opencopy.exe`, `node.exe`, `server/`, `uninstall.exe` |
| `%APPDATA%\io.opencopy.desktop\` | data dir — `pgdata/` (PGlite cluster), `secrets.env` |
| `%LOCALAPPDATA%\io.opencopy.desktop\logs\OpenCopy.log` | rolling log written by `tauri-plugin-log` |
| `%LOCALAPPDATA%\io.opencopy.desktop\EBWebView\` | Tauri's WebView2 user data (cookies, cache) |

### Where things live (macOS)

| Path | What |
|---|---|
| `/Applications/OpenCopy.app/` | app bundle |
| `~/Library/Application Support/io.opencopy.desktop/` | data dir |
| `~/Library/Logs/io.opencopy.desktop/OpenCopy.log` | log |

### First-launch click-throughs (binaries are unsigned)

- **Windows SmartScreen:** "Windows protected your PC" → **More info** → **Run anyway**. Once.
- **macOS Gatekeeper:** double-click → "OpenCopy can't be opened…" → **OK** → right-click app → **Open** → **Open** in dialog. Once.
- **macOS quarantine** ("OpenCopy is damaged…"): rare, fix with `xattr -cr /Applications/OpenCopy.app` once.

This is intentional (saves $400/yr in cert fees). Documented in README. Will fix when OpenCopy reaches non-colleague distribution.

---

## 7. Codebase conventions

### Server actions
- Live in `src/server/actions/<feature>.ts`.
- Top of file: `"use server"`.
- Auth gate via `requireUserId()` / `getCurrentWorkspace()` / `requireRole(...)` from `@/lib/auth/workspace`.
- Input validation via `zod` parsers on raw args (server actions can be called with untyped data from client forms).

### Database schema
- Single file: `src/db/schema.ts`. Drizzle-flavoured pgTable definitions.
- Workspace-scoped tables have `workspace_id uuid NOT NULL REFERENCES workspace(id)`.
- Migrations: `pnpm db:generate` (writes `drizzle/<n>_<adjective>_<superhero>.sql`). Always commit + the matching `drizzle/meta/<n>_snapshot.json`.
- Enums: `pgEnum` declarations near the tables that use them.

### Auth
- Auth.js v5 (`next-auth@5.0.0-beta.31`). DrizzleAdapter, dev creds + Resend providers.
- `events.signIn` → `ensureWorkspaceForUser(userId, email, name)` auto-creates a personal workspace + owner membership + `userPrefs` row on first login.
- Memory note: an old session memory said "Auth.js → Firebase Auth pivot 2026-04-30". Not true — Auth.js still ships, no Firebase deps. Trust the codebase, ignore that memory.

### UI
- `src/components/ui/*` — shadcn primitives. Don't rewrite, extend.
- `src/components/<feature>/*` — feature-specific components.
- `src/components/shell/sidebar.tsx` + `topbar.tsx` — the app frame. Sidebar groups: BRAND / WORK / COMPOSE / footer.
- Sidebar nav links carry `data-tour="nav-<href>"` for the first-run tour.

### Tours
- Definitions: `src/lib/tours/definitions.tsx`. JSX content per step.
- State: `user_prefs.tours_completed jsonb` (one bool per `TourId`).
- Server actions: `src/server/actions/tours.ts` (`getToursCompleted`, `markTourCompleted`, `resetTours`).
- Runner: `src/components/tours/tour-runner.tsx` — wraps the app layout, exposes `useTours()` hook.
- Adding a new tour: extend `TourId` in tours.ts, add definition, add to `ALL_TOURS`. User menu chooser auto-picks it up.

### Workspace export/import
- File format spec: `src/lib/export/workspace-format.ts`. Constants + Zod schemas.
- Exporter: `src/lib/export/workspace-export.ts` — takes `db` as parameter (testable).
- Importer: `src/lib/export/workspace-import.ts` — same.
- API routes: `src/app/api/workspace/{export,import}/route.ts`. POST + multipart for import.
- Dialogs: `src/components/workspaces/{export,import}-workspace-dialog.tsx`.

### Library — polymorphic items
- Page: `src/app/(app)/library/page.tsx` (server) → `src/components/library/library-board.tsx` (client).
- Source of truth: `listLibrary()` in `src/server/actions/library.ts` returns a polymorphic `LibraryItem` discriminated by `kind`: `variant` (Copywriter/Localizer agent variants), `chat_message` (saved chat replies), `document_selection` (saved highlights from the Tiptap editor).
- Filter chips: kind (copywriter / localizer / chat saves / document selections) · voice · locale. Pure client-side filtering.
- **Bulk select + bulk delete** via the toolbar that appears once any item is checked. `bulkDeleteLibraryItems({ variantIds, entryIds })` server action handles both shapes.
- Export: `src/app/api/library/export/route.ts` — `?format=json|csv|md`.
- New saves: chat → "Save to library" button on chat replies; document → highlight + bubble action.

---

## 8. Common task recipes

### Run dev server with embedded PGlite (PowerShell)
```powershell
$env:OPENCOPY_EMBEDDED_DB = "1"
$env:OPENCOPY_DATA_DIR = "$PWD\.opencopy-data"
pnpm dev
```
To revert: `Remove-Item Env:OPENCOPY_EMBEDDED_DB, Env:OPENCOPY_DATA_DIR` or open a new shell.

### Wipe local PGlite cluster (when stuck)
```powershell
Remove-Item -Recurse -Force .opencopy-data
```

### Build the installer locally (Windows)
Requires Developer Mode (Settings → For developers → Developer Mode → ON).
```powershell
pnpm tauri:build
# Artifacts at:
# src-tauri\target\release\bundle\nsis\OpenCopy_<v>_x64-setup.exe
# src-tauri\target\release\bundle\msi\OpenCopy_<v>_x64_en-US.msi
```

### Tag a new release (triggers CI matrix build)
```bash
# Bump version in src-tauri/tauri.conf.json + src-tauri/Cargo.toml first
git add -A && git commit -m "chore: bump installer version to x.y.z"
git tag vx.y.z
git push origin master --tags
```

### Smoke-test the bundled server (without launching Tauri shell)
Useful to verify a bundle's `node_modules` is complete before installing.
```powershell
cd "$env:LOCALAPPDATA\OpenCopy\server"
$env:PORT="14999"
$env:OPENCOPY_EMBEDDED_DB="1"
$env:OPENCOPY_DATA_DIR="$env:TEMP\oc-test"
$env:AUTH_SECRET="test"
$env:ENCRYPTION_KEY="test"
$env:NODE_ENV="production"
& "$env:LOCALAPPDATA\OpenCopy\node.exe" server.js
# Should print "▲ Next.js …" and "✓ Ready in NNNms"
```

### Hot-patch a missing module into an installed bundle
```powershell
$pkg = "react-dom"  # change as needed
$src = "C:\Users\ahrod\Desktop\Pleso\opencopy\node_modules\$pkg"
if (-not (Test-Path $src)) {
  $src = Get-ChildItem -Path "C:\Users\ahrod\Desktop\Pleso\opencopy\node_modules\.pnpm" -Recurse -Filter $pkg -Directory |
         Select-Object -First 1 -ExpandProperty FullName
}
Copy-Item -Recurse -Force $src "$env:LOCALAPPDATA\OpenCopy\server\node_modules\$pkg"
```

### Cancel + retag a CI run that's stuck
```bash
gh run cancel <run-id>
git tag -d vx.y.z
git push origin :refs/tags/vx.y.z   # delete remote
# fix the bug
git add -A && git commit -m "..."
git push origin master
git tag vx.y.z   # or bump to rc.<n+1>
git push origin vx.y.z
```

### Watch CI without blocking
```bash
gh run watch <run-id> --exit-status
```
Returns exit 0 on success, non-zero on failure. Wrap in `&` or use `Bash.run_in_background` to get an auto-notification when done.

---

## 9. Decision log (the meta — why we did things)

### Installer
- **PGlite over native Postgres + pgvector binaries.** Plan said native; we swapped because pgvector cross-compile in CI is fragile and per-platform binaries balloon the installer ~3×. PGlite covers our schema (vector(1536), cosineDistance), smoke test confirms. Single dep tree, single bundle.
- **No code signing.** $99 (Apple) + $300 (Windows) per year, deliberately skipped to keep distribution free. Colleagues click through OS warnings once. Documented.
- **No Tauri webview wizard, no in-app UI.** Earlier plan envisioned a wizard inside the Tauri shell. Shipped: the Tauri main window navigates to the local server itself (see "Library polymorphism + native-app shell" below), and the tray menu keeps an "Open in browser" fallback for corporate-proxy / WebView2-quirk cases.
- **Mac ARM only in CI.** macOS-13 (Intel) dropped due to free-tier queue starvation.

### Workspace export/import
- **Single zip with optional encrypted wrapper.** First byte tells the parser which mode (`P` = bare zip, `{` = encrypted-wrapper). Inside is the same structure either way.
- **Embeddings in a separate compact binary.** `embeddings/chunks.bin` with `OCEMB1` magic + dim + per-row UUID + float32-LE. ~3× smaller than JSON-of-floats; matches pgvector's float32 internal precision (no information loss).
- **Member rows exported as labels only.** Preserves the no-cross-install-identity invariant. Importer becomes sole owner; re-invites teammates.
- **API keys never exported.** Separate concern; security-sensitive.

### Guided tours
- **react-joyride v3.** Latest stable. Dynamic-imported via `next/dynamic` because it pulls DOM APIs eagerly.
- **Tour state in `user_prefs.tours_completed jsonb`.** Survives sign-out and reinstall (since it lives in the local DB).
- **Per-surface `?` buttons deferred.** User-menu chooser is sufficient for V1; surface buttons are pure polish.

### Library polymorphism + native-app shell
- **`library_entries` table** carries non-variant saves (chat, document selection); `copy_variant` rows still represent agent-run variants. The `listLibrary()` server action unions them into a discriminated `LibraryItem`, giving the client a single uniform list.
- **Tauri main window now visible (`visible: true`)** at 1280×800, centered. Boot flow: window opens on `dist/index.html` splash → Rust waits for the local server → `navigate_to_app()` redirects the webview to `http://127.0.0.1:<port>`. Tray menu keeps "Open in browser" as fallback for corporate-proxy / WebView2 cases. The app now feels like a real desktop app instead of a tray-launcher.
- **NSIS installer hooks** wired via `bundle.windows.nsis.installerHooks: "windows/installer-hooks.nsh"` — close the running OpenCopy before extract so the orphan-node.exe file-lock issue (§ 5.12) is gone for good.

### Security audit
- **drizzle-orm 0.38 → 0.45.2.** HIGH SQL injection patch.
- **next-auth beta.25 → beta.31.** Email misdelivery patch.
- **postcss override `^8.5.10`.** Build-time XSS patch via `pnpm.overrides`.
- **`ai` SDK 4 → 6 migration shipped.** Bumped past v5 (already superseded), swapped `ollama-ai-provider@1.2.0` for the community fork `ollama-ai-provider-v2`. Chat path (route + `useChat`) rewritten around the v6 transport + `UIMessage[]` API; agent stack updated to the v6 model/message types. The two prior `ai` low/moderate CVEs are closed as a side effect.
- **Node SHA256 verification** added to `download-node.mjs`. Closes the "compromised mirror over valid TLS" supply-chain hole.
- **SLSA build provenance** wired but `continue-on-error` (private-repo limitation). Will start working when repo flips public.

---

## 10. Known stale memories (from older session contexts)

When something contradicts the codebase, **trust the codebase**. One persistent anti-pattern worth flagging:

- **"Auth.js was removed, Firebase Auth is sole IdP"** — false. Auth.js v5 (`next-auth@5.0.0-beta.31`) still ships, no Firebase deps anywhere. The Firebase pivot was floated and rejected.

If a future session loads a memory that conflicts with reality, prefer this file + the actual code over the older memory.

---

## 11. Quick "where do I start" checklist for a new session

1. **Read this file** + `CLAUDE.md`.
2. `git pull && git log --oneline -10` — see what's new.
3. `pnpm install` — sync deps if `pnpm-lock.yaml` changed.
4. `pnpm typecheck` — confirm the tree compiles before touching anything.
5. Take direction from the maintainer; the roadmap is being reset and no in-repo planning doc currently lists "next up."
6. For installer-touching changes: run `node scripts/test-pglite-migrate.mjs` after schema changes; run `pnpm tsx scripts/test-workspace-roundtrip.ts` after touching `src/lib/export/`.
7. Tag a release only when something user-visible has shipped — every tag burns ~30 min of CI minutes.

---

*Future-you: keep this file alive; add a § for each new gnarly thing you discover.*
