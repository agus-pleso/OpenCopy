#!/usr/bin/env node
// Builds Next.js in standalone mode and assembles the runtime tree at
// src-tauri/server/, which the Tauri shell ships as a bundled resource and
// spawns at startup. Run before `tauri build` (wired via beforeBuildCommand).
//
// On Windows + pnpm, Next's standalone copier needs symlink permissions —
// enable Developer Mode (Settings → For developers → Developer Mode) or run
// from an elevated shell. CI runners (windows-latest / macos-latest /
// ubuntu-latest) work out of the box.

import { execSync } from "node:child_process";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

// Locate a package's installed directory. Tries the hoisted top-level path
// first, then falls back to scanning `node_modules/.pnpm/` for the deepest
// match (handles pnpm's nested layout where peer deps don't reach the root).
function findPackagePath(root, pkg) {
  const direct = join(root, "node_modules", pkg);
  if (existsSync(direct)) return direct;

  const pnpmRoot = join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmRoot)) return null;

  const slug = pkg.replace("/", "+");
  const entries = readdirSync(pnpmRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(`${slug}@`))
    .map((e) => join(pnpmRoot, e.name, "node_modules", pkg))
    .filter((p) => existsSync(p));
  return entries[0] ?? null;
}

const root = process.cwd();
const dotNext = join(root, ".next");
const standalone = join(dotNext, "standalone");
const staticDir = join(dotNext, "static");
const publicDir = join(root, "public");
const dest = join(root, "src-tauri", "server");

console.log("→ next build (standalone)");
execSync("pnpm exec next build", {
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "standalone" },
});

if (!existsSync(standalone)) {
  console.error(
    "Next build did not produce .next/standalone — check the build log above.\n" +
      "On Windows + pnpm this typically means symlink permission was denied;\n" +
      "enable Developer Mode in Windows settings and re-run.",
  );
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

console.log(`→ copying server tree to ${dest}`);
cpSync(standalone, dest, { recursive: true, dereference: false });
cpSync(staticDir, join(dest, ".next", "static"), { recursive: true });
if (existsSync(publicDir)) {
  cpSync(publicDir, join(dest, "public"), { recursive: true });
}

// Ship the migrations folder + the standalone migration runner. The Tauri
// Rust shell spawns `node migrate.mjs` against the embedded PGlite store
// before starting the Next server.
const drizzleDir = join(root, "drizzle");
if (existsSync(drizzleDir)) {
  cpSync(drizzleDir, join(dest, "drizzle"), { recursive: true });
}
const migrateScript = join(root, "src-tauri", "migrate.mjs");
if (existsSync(migrateScript)) {
  copyFileSync(migrateScript, join(dest, "migrate.mjs"));
}

// Next.js's runtime require-hook walks the bare node_modules tree to resolve
// peer deps. pnpm leaves them in .pnpm/ where Node can't find them, so we
// have to copy each one to the bundle root. List from `next/package.json`
// dependencies + the platform-specific SWC binary.
const SWC_BY_PLATFORM = {
  "win32-x64": "@next/swc-win32-x64-msvc",
  "win32-arm64": "@next/swc-win32-arm64-msvc",
  "darwin-x64": "@next/swc-darwin-x64",
  "darwin-arm64": "@next/swc-darwin-arm64",
  "linux-x64": "@next/swc-linux-x64-gnu",
  "linux-arm64": "@next/swc-linux-arm64-gnu",
};
const PEER_DEPS_TO_HOIST = [
  "styled-jsx",
  "@swc/helpers",
  "@next/env",
  "caniuse-lite",
  "postcss",
];
const swcPkg = SWC_BY_PLATFORM[`${process.platform}-${process.arch}`];
if (swcPkg) PEER_DEPS_TO_HOIST.push(swcPkg);

for (const pkg of PEER_DEPS_TO_HOIST) {
  const dst = join(dest, "node_modules", pkg);
  if (existsSync(dst)) continue;
  const src = findPackagePath(root, pkg);
  if (!src) {
    console.warn(`⚠ ${pkg} not found in node_modules tree — skipping`);
    continue;
  }
  mkdirSync(join(dst, ".."), { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  console.log(`→ hoisted ${pkg} into bundle/node_modules/`);
}

console.log("✓ server bundle ready at src-tauri/server/");
