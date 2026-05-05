#!/usr/bin/env node
// Downloads the Node.js binary for the current platform into
// src-tauri/binaries/node-<target-triple>(.exe). Tauri picks it up via
// bundle.externalBin and ships it inside the installer as a sidecar.
//
// Usage:
//   node scripts/download-node.mjs            # downloads for current host
//   node scripts/download-node.mjs --target=darwin-arm64
//   node scripts/download-node.mjs --target=darwin-x64
//   node scripts/download-node.mjs --target=win32-x64
//   node scripts/download-node.mjs --target=linux-x64

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NODE_VERSION = process.env.NODE_VERSION || "v20.18.0";

/**
 * Download SHASUMS256.txt from nodejs.org and parse out the SHA256 we expect
 * for the given archive filename. Without this, a successful TLS connection
 * to a compromised mirror would let a malicious archive sneak in.
 */
function fetchExpectedSha(version, filename, workDir) {
  const url = `https://nodejs.org/dist/${version}/SHASUMS256.txt`;
  const dest = join(workDir, "SHASUMS256.txt");
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Invoke-WebRequest ${shellQuote(url)} -OutFile ${shellQuote(dest)}"`,
      { stdio: "ignore" },
    );
  } else {
    execSync(`curl -fsSL ${shellQuote(url)} -o ${shellQuote(dest)}`, {
      stdio: "ignore",
    });
  }
  const text = readFileSync(dest, "utf-8");
  const line = text.split(/\r?\n/).find((l) => l.endsWith(`  ${filename}`));
  if (!line) {
    throw new Error(`no checksum line for ${filename} in SHASUMS256.txt`);
  }
  return line.split(/\s+/)[0].toLowerCase();
}

function sha256Of(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex").toLowerCase();
}

const TARGETS = {
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    archive: `node-${NODE_VERSION}-win-x64.zip`,
    extracted: `node-${NODE_VERSION}-win-x64`,
    inner: "node.exe",
    suffix: ".exe",
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    archive: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
    extracted: `node-${NODE_VERSION}-darwin-x64`,
    inner: "bin/node",
    suffix: "",
  },
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    archive: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
    extracted: `node-${NODE_VERSION}-darwin-arm64`,
    inner: "bin/node",
    suffix: "",
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-gnu",
    archive: `node-${NODE_VERSION}-linux-x64.tar.xz`,
    extracted: `node-${NODE_VERSION}-linux-x64`,
    inner: "bin/node",
    suffix: "",
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  let target = `${process.platform}-${process.arch}`;
  for (const a of args) {
    if (a.startsWith("--target=")) target = a.slice("--target=".length);
  }
  return target;
}

function shellQuote(p) {
  return `"${p.replace(/"/g, '""')}"`;
}

function runDownloadAndExtract(url, archivePath, outDir, archiveType) {
  if (process.platform === "win32") {
    if (archiveType === "zip") {
      execSync(
        `powershell -NoProfile -Command "Invoke-WebRequest ${shellQuote(url)} -OutFile ${shellQuote(archivePath)}; Expand-Archive -Force ${shellQuote(archivePath)} ${shellQuote(outDir)}"`,
        { stdio: "inherit" },
      );
    } else {
      // tar is shipped with Windows 10+; works for tar.gz
      execSync(
        `powershell -NoProfile -Command "Invoke-WebRequest ${shellQuote(url)} -OutFile ${shellQuote(archivePath)}"`,
        { stdio: "inherit" },
      );
      execSync(`tar -xf ${shellQuote(archivePath)} -C ${shellQuote(outDir)}`, {
        stdio: "inherit",
      });
    }
  } else {
    execSync(`curl -fsSL ${shellQuote(url)} -o ${shellQuote(archivePath)}`, {
      stdio: "inherit",
    });
    execSync(`tar -xf ${shellQuote(archivePath)} -C ${shellQuote(outDir)}`, {
      stdio: "inherit",
    });
  }
}

const targetKey = parseArgs();
const target = TARGETS[targetKey];
if (!target) {
  console.error(
    `Unsupported target: ${targetKey}. Supported: ${Object.keys(TARGETS).join(", ")}`,
  );
  process.exit(1);
}

const url = `https://nodejs.org/dist/${NODE_VERSION}/${target.archive}`;
const archiveType = target.archive.endsWith(".zip") ? "zip" : "tar";

const root = process.cwd();
const binDir = join(root, "src-tauri", "binaries");
const finalName = `node-${target.triple}${target.suffix}`;
const finalPath = join(binDir, finalName);

if (existsSync(finalPath) && !process.env.FORCE) {
  console.log(`✓ ${finalName} already present (set FORCE=1 to redownload)`);
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });

const work = join(tmpdir(), `opencopy-node-${Date.now()}`);
mkdirSync(work, { recursive: true });
const archivePath = join(work, target.archive);

console.log(`Downloading Node ${NODE_VERSION} for ${targetKey} ...`);
console.log(`  ${url}`);

const expectedSha = fetchExpectedSha(NODE_VERSION, target.archive, work);
runDownloadAndExtract(url, archivePath, work, archiveType);

const actualSha = sha256Of(archivePath);
if (actualSha !== expectedSha) {
  console.error(
    `SHA256 mismatch on ${target.archive}\n  expected: ${expectedSha}\n  actual:   ${actualSha}`,
  );
  process.exit(1);
}
console.log(`✓ SHA256 verified (${expectedSha.slice(0, 16)}…)`);

const extractedExe = join(work, target.extracted, target.inner);
if (!existsSync(extractedExe)) {
  console.error(`expected file not found after extraction: ${extractedExe}`);
  process.exit(1);
}

copyFileSync(extractedExe, finalPath);
if (target.suffix === "") chmodSync(finalPath, 0o755);

try {
  rmSync(work, { recursive: true, force: true });
} catch {}

console.log(`✓ wrote ${finalPath}`);
