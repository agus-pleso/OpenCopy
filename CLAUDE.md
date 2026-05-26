# OpenCopy — project instructions for Claude Code

OpenCopy is an open-source, self-hostable AI copywriting workspace — an open
replica of Jasper-style tools. Next.js 15 + Drizzle + Auth.js v5 + Tailwind v4
+ Tiptap. MIT licensed. Repo: `agus-pleso/OpenCopy` (public).

The maintainer (agus) is the sole engineer. Diana is a marketing-team
teammate who tests the macOS desktop build.

## Working agreements

- **Never push to GitHub or create tags without explicit confirmation.**
- **Don't propose Firebase or live-multiplayer features** — that path was
  abandoned.
- The roadmap is being reset; do not invent future versions or "Phase N"
  planning until the maintainer publishes a new one.
- The UI must feel like a premium marketing tool (Linear / Vercel / Jasper-grade
  polish), not stock shadcn.
- A solved bug is one you can first replicate with a test, then make the test
  pass. Tests live in `scripts/test-*.ts`, run via `pnpm tsx scripts/test-X.ts`
  (no Vitest/Jest — plain tsx scripts that `process.exit(1)` on failure).

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) against `DATABASE_URL` |
| `pnpm tsc --noEmit` | Type-check — run before every commit |
| `pnpm db:generate` | Generate a Drizzle migration from schema diffs |
| `pnpm db:migrate` | Apply migrations |
| `pnpm tsx scripts/test-X.ts` | Run a smoke test |
| `pnpm tauri build` | Build the desktop installer locally |

## Architecture

Two runtime modes share one Drizzle query surface (`src/db/client.ts`):
- **External Postgres** (dev) — `pg.Pool`, via `DATABASE_URL`.
- **Embedded PGlite** (`OPENCOPY_EMBEDDED_DB=1`) — Postgres-as-WASM, used by
  the bundled desktop installer. Data under `OPENCOPY_DATA_DIR`.

**Desktop installer**: Tauri 2.x shell + bundled Node 20 sidecar running the
Next.js standalone server + PGlite. Tray-only; opens the UI in the system
browser. Auto-updater via Tauri's signed channel (Ed25519). Built by GH Actions
matrix (`.github/workflows/release.yml`) on `v*` tag push — Windows NSIS + MSI,
macOS aarch64 DMG.

## Build gotchas (hard-won — see `docs/MEMORY.md` + git history)

- **`db/client.ts` MUST cache its client on `globalThis` unconditionally.**
  The standalone bundler duplicates the module across webpack chunks; a
  `NODE_ENV`-gated cache lets each chunk make its own PGlite instance → writes
  through one are invisible to reads through another. (commit `f979b6f`)
- **macOS bundle needs `entitlements.plist`** with `com.apple.security.cs.allow-jit`
  — without it the bundled Node's V8 can't allocate JIT memory on Apple Silicon
  Sequoia and dies with "Failed to reserve virtual memory for CodeRange".
  (commit `96c2995`)
- **`bundle.createUpdaterArtifacts: true`** is required in `tauri.conf.json` —
  Tauri 2.x defaults it to `false`, so the signed `.app.tar.gz` / `-setup.exe`
  updater archives are never produced. (commit `ac70aac`)
- **Tauri 2.x has no `.nsis.zip`** — the Windows updater consumes the
  `-setup.exe` directly with a sibling `-setup.exe.sig`. `.nsis.zip` is a
  Tauri-1.x convention. (commit `b7190aa`)
- `next.config.ts` gates `output: "standalone"` behind `NEXT_OUTPUT=standalone`
  — unconditional standalone breaks `pnpm build` on Windows (symlink EPERM).
- Auth: `requireUserId` in `src/lib/auth/workspace.ts` verifies the JWT-claimed
  user exists in the DB; `getCurrentWorkspace` self-heals via
  `ensureWorkspaceForUser`. Stale JWT cookies across `AUTH_SECRET` regen cause
  `JWTSessionError: no matching decryption secret`.

## Conventions

- Conventional Commits (`fix(scope):`, `feat(scope):`, `docs:`).
- Server actions are `"use server"` files in `src/server/actions/`.
- AI agents live in `src/lib/agents/`; markdown-output + tolerant parser is the
  house pattern (resilient across small models) — see `voice-analyzer.ts`.
- `server-only` modules keep `node:fs` etc. out of the client bundle; pure
  helpers/types split into `*-shared.ts` siblings.
