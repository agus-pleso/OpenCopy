#!/usr/bin/env node
// Builds a "portable" no-installer archive of OpenCopy for the current
// platform (Windows .zip / macOS .tar.gz). The archive ships the same
// payload the Tauri installer ships — the prepared Next.js standalone
// server tree under src-tauri/server/ plus the bundled Node binary from
// src-tauri/binaries/ — and adds a tiny launcher that mirrors the Rust
// shell's bootstrap (src-tauri/src/lib.rs): pre-bind a free port, spawn
// Node against server/server.js with that port, poll TCP until the
// server accepts, then open the URL in the default browser.
//
// Run AFTER scripts/prepare-server.mjs has populated src-tauri/server/
// and scripts/download-node.mjs has dropped the platform's Node binary
// into src-tauri/binaries/. Usage:
//   node scripts/build-portable.mjs                    # current host
//   node scripts/build-portable.mjs --target=win32-x64
//   node scripts/build-portable.mjs --target=darwin-arm64
//
// Output: src-tauri/target/portable/OpenCopy-<version>-<flavour>.zip|tar.gz
// (src-tauri/target/ is already gitignored via src-tauri/.gitignore).

import { execSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");

// ---------------------------------------------------------------------
// Target matrix — must match scripts/download-node.mjs so we pick up the
// binary it produced. `archiveSlug` is the suffix in the output filename.
// ---------------------------------------------------------------------
const TARGETS = {
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    nodeSuffix: ".exe",
    nodeInnerName: "node.exe",
    archiveSlug: "windows-portable",
    archiveExt: "zip",
    launcherName: "OpenCopy.cmd",
  },
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    nodeSuffix: "",
    nodeInnerName: "node",
    archiveSlug: "macos-aarch64-portable",
    archiveExt: "tar.gz",
    launcherName: "OpenCopy.command",
  },
};

function parseArgs() {
  let target = `${process.platform}-${process.arch}`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--target=")) target = a.slice("--target=".length);
  }
  return target;
}

const targetKey = parseArgs();
const target = TARGETS[targetKey];
if (!target) {
  console.error(
    `Unsupported target: ${targetKey}. Supported: ${Object.keys(TARGETS).join(", ")}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------
// Read the version from tauri.conf.json — single source of truth, same
// value the installer stamps into the bundle so the portable archive
// name lines up with the installer file names.
// ---------------------------------------------------------------------
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
const version = tauriConf.version;
if (!version) {
  console.error(`Could not read version from ${tauriConfPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// Validate that the prerequisites are in place. Both prepare-server and
// download-node must have run before this script.
// ---------------------------------------------------------------------
const serverDir = join(root, "src-tauri", "server");
if (!existsSync(serverDir) || !existsSync(join(serverDir, "server.js"))) {
  console.error(
    `Missing prepared server bundle at ${serverDir}.\n` +
      `Run \`node scripts/prepare-server.mjs\` first.`,
  );
  process.exit(1);
}

const nodeBinary = join(
  root,
  "src-tauri",
  "binaries",
  `node-${target.triple}${target.nodeSuffix}`,
);
if (!existsSync(nodeBinary)) {
  console.error(
    `Missing Node binary at ${nodeBinary}.\n` +
      `Run \`node scripts/download-node.mjs --target=${targetKey}\` first.`,
  );
  process.exit(1);
}

const outDir = join(root, "src-tauri", "target", "portable");
mkdirSync(outDir, { recursive: true });
const archiveBaseName = `OpenCopy-${version}-${target.archiveSlug}`;
const archivePath = join(outDir, `${archiveBaseName}.${target.archiveExt}`);

// Stage everything under a unique temp directory so failures don't pollute
// src-tauri/target/. We clean up at the end (best-effort).
const stage = join(tmpdir(), `opencopy-portable-${Date.now()}`);
const stageRoot = join(stage, archiveBaseName);
mkdirSync(stageRoot, { recursive: true });

console.log(`→ staging at ${stageRoot}`);

// Copy the prepared server tree as-is. Same `dereference: true` as
// prepare-server.mjs — the bundle is already flat, but the safety against
// dangling symlinks crossing filesystem boundaries still applies.
console.log("→ copying server/");
cpSync(serverDir, join(stageRoot, "server"), {
  recursive: true,
  dereference: true,
});

// Copy the Node binary to the archive root, renamed to the platform-
// idiomatic name (`node.exe` / `node`). chmod 755 on POSIX so the user
// doesn't have to fix permissions after extracting the tarball.
console.log(`→ copying ${target.nodeInnerName}`);
const stagedNode = join(stageRoot, target.nodeInnerName);
copyFileSync(nodeBinary, stagedNode);
if (target.nodeSuffix === "") chmodSync(stagedNode, 0o755);

// ---------------------------------------------------------------------
// launch.mjs — the orchestration script that ships inside the archive.
// Mirrors src-tauri/src/lib.rs::spawn_server: pre-bind a free port, spawn
// node against server.js with that port + the embedded-DB env vars,
// poll TCP until the server accepts, then open the URL in the default
// browser. Forwards SIGINT/SIGTERM to the child so the user can stop
// the server with Ctrl+C in a terminal.
// ---------------------------------------------------------------------
const launchMjs = `#!/usr/bin/env node
// Auto-generated by scripts/build-portable.mjs. Do not edit in the archive —
// regenerate the archive instead. Mirrors src-tauri/src/lib.rs.

import { createServer, Socket } from "node:net";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, "server");
const serverJs = join(serverDir, "server.js");

// Per-user data dir set by the platform launcher (.cmd / .command) before
// this script ran. Create it if missing — Postgres + secrets land here.
const dataDir = process.env.OPENCOPY_DATA_DIR;
if (dataDir && !existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// Per-install secrets for the bundled server. Mirrors
// src-tauri/src/secrets.rs::load_or_generate — \`AUTH_SECRET\` and
// \`ENCRYPTION_KEY\` are required; if missing, generate base64 32-byte
// random values and persist to <data>/secrets.env (mode 0600 on POSIX).
// Without this the server boots but Auth.js refuses to issue sessions
// because AUTH_SECRET is empty.
function loadOrGenerateSecrets(root) {
  const required = ["AUTH_SECRET", "ENCRYPTION_KEY"];
  const file = join(root, "secrets.env");
  const out = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf-8").split(/\\r?\\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  let changed = false;
  for (const key of required) {
    if (!out[key]) {
      out[key] = randomBytes(32).toString("base64");
      changed = true;
    }
  }
  if (changed) {
    const text = Object.entries(out)
      .map(([k, v]) => \`\${k}=\${v}\`)
      .join("\\n");
    writeFileSync(file, text + "\\n", { encoding: "utf-8" });
    if (process.platform !== "win32") {
      try {
        chmodSync(file, 0o600);
      } catch {}
    }
  }
  return out;
}

const secrets = dataDir ? loadOrGenerateSecrets(dataDir) : {};

// Pre-bind a free port: TcpListener::bind(":0") in Rust, the equivalent
// in Node. The kernel hands us an unused port; we capture it and release
// the socket so the spawned Next.js server can grab it. Small race window
// exists between release and re-bind, but the production Rust launcher
// tolerates the same window (lib.rs::find_free_port).
const port = await new Promise((resolve, reject) => {
  const s = createServer();
  s.unref();
  s.on("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});

const url = \`http://127.0.0.1:\${port}\`;

const env = {
  ...process.env,
  ...secrets,
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  NODE_ENV: "production",
  OPENCOPY_EMBEDDED_DB: "1",
  AUTH_TRUST_HOST: "true",
  DEV_AUTH_ENABLED: "true",
  NEXT_PUBLIC_APP_URL: url,
};

// Run migrations against the embedded PGlite store before booting the
// server — same ordering as lib.rs::spawn_server. The bundle ships
// migrate.mjs as a sibling of server.js (prepare-server.mjs copies it).
const migrateJs = join(serverDir, "migrate.mjs");
if (existsSync(migrateJs)) {
  await new Promise((resolve, reject) => {
    const m = spawn(process.execPath, [migrateJs], {
      cwd: serverDir,
      env,
      stdio: "inherit",
    });
    m.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(\`migrations exited with code \${code}\`)),
    );
    m.on("error", reject);
  });
}

const child = spawn(process.execPath, [serverJs], {
  cwd: serverDir,
  env,
  stdio: "inherit",
});

// Poll TCP until the Next server accepts a connection. 60-second deadline,
// 200 ms interval — mirrors lib.rs::wait_for_server.
const deadline = Date.now() + 60_000;
let ready = false;
while (Date.now() < deadline) {
  const ok = await new Promise((resolve) => {
    const sock = new Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(result);
    };
    sock.setTimeout(150, () => finish(false));
    sock.once("error", () => finish(false));
    sock.once("connect", () => finish(true));
    sock.connect(port, "127.0.0.1");
  });
  if (ok) {
    ready = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

if (!ready) {
  console.error("OpenCopy server did not become ready within 60s — aborting.");
  child.kill();
  process.exit(1);
}

// Open the URL in the user's default browser. \`start "" <url>\` on
// Windows (the empty title arg is required so \`start\` doesn't
// misinterpret the URL as a window title), \`open <url>\` on macOS.
const opener = process.platform === "win32" ? "cmd" : "open";
const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
const o = spawn(opener, args, { detached: true, stdio: "ignore" });
o.unref();

console.log(\`OpenCopy is running at \${url}\`);
console.log("Press Ctrl+C to stop the server.");

// Forward shutdown signals to the Next child so Ctrl+C in the terminal
// cleanly stops the server instead of orphaning it.
const forward = (signal) => () => {
  try {
    child.kill(signal);
  } catch {}
};
process.on("SIGINT", forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
`;

writeFileSync(join(stageRoot, "launch.mjs"), launchMjs, { encoding: "utf-8" });

// ---------------------------------------------------------------------
// Platform launcher script. Sets the embedded-mode env vars + data dir
// (platform-specific path), then invokes the bundled Node against
// launch.mjs. Keeping the orchestration in launch.mjs (rather than
// cmd / bash) means the TCP pre-bind + poll logic lives in one
// cross-platform place that exactly mirrors lib.rs.
// ---------------------------------------------------------------------
if (targetKey === "win32-x64") {
  // CRLF line endings — Windows cmd.exe is happy with either, but native
  // CRLF avoids surprises when users open the file in Notepad.
  const cmd = [
    "@echo off",
    "setlocal",
    'cd /d "%~dp0"',
    "set OPENCOPY_EMBEDDED_DB=1",
    'set "OPENCOPY_DATA_DIR=%LOCALAPPDATA%\\OpenCopy"',
    'if not exist "%OPENCOPY_DATA_DIR%" mkdir "%OPENCOPY_DATA_DIR%"',
    '"%~dp0node.exe" "%~dp0launch.mjs"',
    "endlocal",
    "",
  ].join("\r\n");
  writeFileSync(join(stageRoot, target.launcherName), cmd, {
    encoding: "utf-8",
  });
} else {
  // POSIX shell — single source of truth for env vars, then `exec` so
  // signals reach Node directly. LF endings, chmod 755 so double-click
  // from Finder works after extracting the tar.gz.
  const sh = [
    "#!/usr/bin/env bash",
    "set -e",
    'DIR="$(cd "$(dirname "$0")" && pwd)"',
    'cd "$DIR"',
    "export OPENCOPY_EMBEDDED_DB=1",
    'export OPENCOPY_DATA_DIR="$HOME/Library/Application Support/OpenCopy"',
    'mkdir -p "$OPENCOPY_DATA_DIR"',
    'exec "./node" "./launch.mjs"',
    "",
  ].join("\n");
  const launcherPath = join(stageRoot, target.launcherName);
  writeFileSync(launcherPath, sh, { encoding: "utf-8" });
  chmodSync(launcherPath, 0o755);
}

// ---------------------------------------------------------------------
// Pack the staged tree. Windows = zip via fflate (deterministic, no
// platform tooling required). macOS = tar.gz via `tar -czf` so file
// modes (the +x bit on the launcher + node binary) survive — fflate's
// zip preserves modes too on most extractors, but bsdtar's tar.gz is
// the canonical macOS distribution format and chmod 755 inside it is
// universally honoured.
// ---------------------------------------------------------------------
if (target.archiveExt === "zip") {
  console.log(`→ packing ${archivePath}`);
  // fflate's zipSync takes a nested-object tree, where each leaf is a
  // Uint8Array (file contents). Walk the stage dir and build the tree.
  const entries = {};
  function walk(dir, prefix) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, item.name);
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        walk(abs, rel);
      } else {
        // Use forward slashes inside the zip — Windows Explorer + every
        // other tool we care about understand both, but POSIX users
        // extracting the zip would otherwise get literal backslashes
        // in filenames.
        entries[rel] = readFileSync(abs);
      }
    }
  }
  walk(stageRoot, archiveBaseName);
  const zipped = zipSync(entries, { level: 6 });
  writeFileSync(archivePath, zipped);
} else {
  console.log(`→ packing ${archivePath}`);
  // -C runs tar from inside the stage parent so the archive contains a
  // single top-level OpenCopy-<version>-<flavour>/ directory rather
  // than a path-relative tree. --no-xattrs / --no-mac-metadata keep
  // bsdtar from sprinkling ._* sidecar files (those are extended
  // attributes / Finder metadata that don't survive non-macOS extractors).
  const tarCmd =
    process.platform === "darwin"
      ? `tar --no-xattrs --no-mac-metadata -czf ${shellQuote(archivePath)} -C ${shellQuote(stage)} ${shellQuote(archiveBaseName)}`
      : `tar -czf ${shellQuote(archivePath)} -C ${shellQuote(stage)} ${shellQuote(archiveBaseName)}`;
  execSync(tarCmd, { stdio: "inherit" });
}

// Best-effort cleanup. If this fails (Windows file locks, etc.) the temp
// dir lingers in %TEMP% / /tmp — harmless, and the next run uses a fresh
// timestamped dir anyway.
try {
  rmSync(stage, { recursive: true, force: true });
} catch {}

const { size } = statSync(archivePath);
const mb = (size / (1024 * 1024)).toFixed(1);
console.log(`✓ ${archivePath} (${mb} MB)`);

function shellQuote(p) {
  return `"${p.replace(/"/g, '\\"')}"`;
}
