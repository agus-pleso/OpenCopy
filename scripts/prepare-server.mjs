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
  statSync,
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

// Next.js's runtime require-hook walks the bare node_modules tree to resolve
// peer deps. pnpm leaves them in .pnpm/ where Node can't find them, so we
// have to copy each one to the bundle root. List from `next/package.json`
// dependencies + the platform-specific SWC binary. Also doubles as the
// authoritative keep-list for the prod-closure hoist below.
const SWC_BY_PLATFORM = {
  "win32-x64": "@next/swc-win32-x64-msvc",
  "win32-arm64": "@next/swc-win32-arm64-msvc",
  "darwin-x64": "@next/swc-darwin-x64",
  "darwin-arm64": "@next/swc-darwin-arm64",
  "linux-x64": "@next/swc-linux-x64-gnu",
  "linux-arm64": "@next/swc-linux-arm64-gnu",
};
const PEER_DEPS_TO_HOIST = [
  // Next.js runtime peers
  "styled-jsx",
  "@swc/helpers",
  "@next/env",
  "caniuse-lite",
  "postcss",
  // React runtime — Next imports `react-dom/server.browser` from a deeply-
  // nested location, and the symlink-preserving cpSync of standalone
  // doesn't always resolve to the right node_modules layout on the install
  // target. Hoisting the real files dereferenced removes the surprise.
  "react",
  "react-dom",
  "scheduler",
  // node-postgres — `pg` is statically imported by src/db/client.ts even in
  // embedded mode (the `useEmbedded` branch doesn't use it, but webpack
  // still bundles the import). pg's internals require these at runtime.
  "pg-types",
  "pg-pool",
  "pg-connection-string",
  "pgpass",
  "split2",
];
const swcPkg = SWC_BY_PLATFORM[`${process.platform}-${process.arch}`];
if (swcPkg) PEER_DEPS_TO_HOIST.push(swcPkg);

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

// `dereference: true` — resolve every symlink during the copy and write
// real files. pnpm's standalone-output layout symlinks node_modules
// entries back into .pnpm/, and those symlinks don't survive being
// installed to a different filesystem location (Windows junctions break,
// the install target's nested node_modules walk doesn't resolve into
// .pnpm/). Dereferencing produces a flat self-contained bundle that
// works regardless of the install path.
console.log(`→ copying server tree to ${dest}`);
cpSync(standalone, dest, { recursive: true, dereference: true });
cpSync(staticDir, join(dest, ".next", "static"), {
  recursive: true,
  dereference: true,
});
if (existsSync(publicDir)) {
  cpSync(publicDir, join(dest, "public"), { recursive: true, dereference: true });
}

// Defence in depth: hoist pnpm's .pnpm/ staging dirs to the bundle's top-level
// node_modules. Next's tracer may miss transitive deps that are only reached
// via runtime require.resolve() (styled-jsx → client-only, pg → pg-types →
// postgres-array, react-dom internals, etc.) — hoisting them eliminates the
// missing-module class of bug.
//
// We only hoist the *production* transitive closure (not the entire .pnpm/
// directory). That drops ~25 MB of dev-only weight (typescript, eslint,
// drizzle-kit, @types/*, …) per installer variant. The closure is computed
// via `pnpm list --prod --depth=Infinity --json`, which already accounts for
// optional+peer resolution. We union with PEER_DEPS_TO_HOIST (see below) as
// belt-and-braces — every slug it references is normally in the closure
// already, but keeping the list means future runtime-only deps can be added
// without re-deriving the closure logic.
const projectPnpm = join(root, "node_modules", ".pnpm");
const bundleNodeModules = join(dest, "node_modules");

// Compute prod-closure .pnpm slugs (e.g. `react@19.2.5`, `pg-pool@3.13.0_pg@8.20.0`).
function computeProdClosureSlugs(cwd) {
  const out = execSync("pnpm list --prod --depth=Infinity --json", {
    cwd,
    encoding: "utf8",
    // Node's default 1 MB buffer overflows; the JSON for this tree is ~5 MB.
    maxBuffer: 256 * 1024 * 1024,
  });
  const tree = JSON.parse(out);
  const slugs = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.path === "string") {
      const norm = node.path.split("\\").join("/");
      const i = norm.indexOf("/.pnpm/");
      if (i !== -1) {
        const slug = norm.slice(i + "/.pnpm/".length).split("/")[0];
        if (slug) slugs.add(slug);
      }
    }
    if (node.dependencies) {
      for (const k of Object.keys(node.dependencies)) walk(node.dependencies[k]);
    }
  };
  for (const root of tree) {
    if (root.dependencies) {
      for (const k of Object.keys(root.dependencies)) walk(root.dependencies[k]);
    }
  }
  return slugs;
}

// Cheap recursive byte total. Used only for the post-hoist log line.
function dirSize(path) {
  let total = 0;
  const stack = [path];
  while (stack.length) {
    const p = stack.pop();
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const sub = join(p, entry.name);
      if (entry.isDirectory()) stack.push(sub);
      else if (entry.isFile()) {
        try {
          total += statSync(sub).size;
        } catch {
          // missing/perm: ignore
        }
      }
    }
  }
  return total;
}

if (existsSync(projectPnpm) && existsSync(bundleNodeModules)) {
  console.log("→ computing production transitive closure");
  const keep = computeProdClosureSlugs(root);
  const closureSize = keep.size;

  // Union with PEER_DEPS_TO_HOIST resolved to slugs. These are normally in
  // the closure already, but the explicit list is the canonical record of
  // what the runtime needs — keep it authoritative.
  const allSlugs = readdirSync(projectPnpm).filter(
    (d) => !d.startsWith(".") && existsSync(join(projectPnpm, d, "node_modules")),
  );
  for (const peer of PEER_DEPS_TO_HOIST) {
    const slugPrefix = peer.replace("/", "+") + "@";
    for (const s of allSlugs) {
      if (s.startsWith(slugPrefix)) keep.add(s);
    }
  }
  const addedByPeerList = keep.size - closureSize;

  console.log(
    `→ hoisting ${keep.size} .pnpm dirs (${closureSize} from closure` +
      (addedByPeerList ? `, +${addedByPeerList} from PEER_DEPS_TO_HOIST` : "") +
      `) to bundle node_modules root`,
  );

  let hoistCopied = 0;
  let hoistSkipped = 0;
  let omitted = 0;
  let bytesCopied = 0;
  let bytesOmitted = 0;
  for (const entryDir of readdirSync(projectPnpm)) {
    if (entryDir.startsWith(".")) continue;
    const innerNm = join(projectPnpm, entryDir, "node_modules");
    if (!existsSync(innerNm)) continue;

    if (!keep.has(entryDir)) {
      omitted++;
      try {
        bytesOmitted += dirSize(innerNm);
      } catch {
        // ignore
      }
      continue;
    }

    for (const item of readdirSync(innerNm)) {
      const itemPath = join(innerNm, item);
      // Scoped packages: @scope/<pkg>
      if (item.startsWith("@")) {
        for (const sub of readdirSync(itemPath)) {
          const fullName = `${item}/${sub}`;
          const dst = join(bundleNodeModules, fullName);
          if (existsSync(dst)) {
            hoistSkipped++;
            continue;
          }
          mkdirSync(join(bundleNodeModules, item), { recursive: true });
          cpSync(join(itemPath, sub), dst, {
            recursive: true,
            dereference: true,
          });
          try {
            bytesCopied += dirSize(dst);
          } catch {
            // ignore
          }
          hoistCopied++;
        }
      } else {
        const dst = join(bundleNodeModules, item);
        if (existsSync(dst)) {
          hoistSkipped++;
          continue;
        }
        cpSync(itemPath, dst, { recursive: true, dereference: true });
        try {
          bytesCopied += dirSize(dst);
        } catch {
          // ignore
        }
        hoistCopied++;
      }
    }
  }
  const mb = (n) => (n / (1024 * 1024)).toFixed(1);
  console.log(
    `  hoisted ${hoistCopied} packages (${hoistSkipped} already present), ${mb(bytesCopied)} MB`,
  );
  console.log(
    `  omitted ${omitted} dev-only .pnpm dirs (~${mb(bytesOmitted)} MB saved)`,
  );
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
