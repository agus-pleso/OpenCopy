// Regression test for the "unbounded zip unpacking" bug.
//
// Before the fix, parseOpenCopy() called unzipSync(zipBytes) with zero caps
// on entry count or decompressed size — a malicious .opencopy file could
// pack thousands of highly-compressible entries or one multi-GB entry, both
// of which would blow up server memory before any validation ran.
//
// The fix enforces:
//   - per-entry decompressed size cap (100 MB)
//   - total entry count cap (1000 entries)
// Anything above those throws an ImportError with code BAD_FORMAT.
//
// This test:
//   - Builds two pathological zips in-process (no I/O).
//   - Confirms each is rejected by parseOpenCopy.
//   - Confirms a well-formed (small) zip still parses (negative-of-negative
//     guard — make sure we didn't break the happy path).
//
//   pnpm tsx scripts/test-workspace-import-zip-caps.ts
//
// HIGH — zip-bomb risk on workspace import (v2.5.0).

import { zipSync, strToU8 } from "fflate";

import {
  ImportError,
  parseOpenCopy,
} from "../src/lib/export/workspace-import";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ---- 1. too-many-entries zip --------------------------------------------
console.log("→ build zip with 1500 entries");
const tooMany: Record<string, Uint8Array> = {};
for (let i = 0; i < 1500; i++) {
  tooMany[`junk/${i}.txt`] = strToU8("x");
}
const tooManyZip = Buffer.from(zipSync(tooMany));
console.log(`  zip bytes: ${tooManyZip.length}`);

let threw = false;
let code: string | undefined;
try {
  parseOpenCopy(tooManyZip);
} catch (err) {
  if (err instanceof ImportError) {
    threw = true;
    code = err.code;
  } else {
    fail(`unexpected error type: ${(err as Error).message}`);
  }
}
if (!threw) fail("expected ImportError when zip has too many entries");
if (code !== "BAD_FORMAT") {
  fail(`expected code BAD_FORMAT for too-many-entries, got ${code}`);
}
console.log(`✓ 1500-entry zip rejected (code=${code})`);

// ---- 2. too-big-entry zip ------------------------------------------------
//
// Build a zip whose single entry's UNCOMPRESSED size is comfortably above
// 100 MB. We use a 120 MB Uint8Array of zeros — fflate will deflate that to
// a tiny payload but the entry's `originalSize` is still 120 MB, so the
// filter must reject it.
console.log("\n→ build zip with one 120 MB entry");
const big = new Uint8Array(120 * 1024 * 1024); // 120 MB of zero bytes
const bigZip = Buffer.from(
  zipSync({
    "manifest.json": strToU8("{}"),
    "tables/huge.bin": big,
  }),
);
console.log(`  zip bytes: ${bigZip.length}`);

threw = false;
code = undefined;
try {
  parseOpenCopy(bigZip);
} catch (err) {
  if (err instanceof ImportError) {
    threw = true;
    code = err.code;
  } else {
    fail(`unexpected error type: ${(err as Error).message}`);
  }
}
if (!threw) fail("expected ImportError when an entry exceeds the size cap");
if (code !== "BAD_FORMAT") {
  fail(`expected code BAD_FORMAT for too-big-entry, got ${code}`);
}
console.log(`✓ 120 MB-entry zip rejected (code=${code})`);

// ---- 3. happy path: a small zip without a manifest still gets past the
//    cap checks and only fails on the manifest validation. That confirms
//    the caps don't kill legitimate imports.
console.log("\n→ build small zip with junk (no manifest)");
const smallZip = Buffer.from(
  zipSync({
    "tables/foo.jsonl": strToU8("{}"),
  }),
);
threw = false;
code = undefined;
try {
  parseOpenCopy(smallZip);
} catch (err) {
  if (err instanceof ImportError) {
    threw = true;
    code = err.code;
  }
}
if (!threw) fail("small zip with no manifest should still throw");
if (code !== "BAD_MANIFEST") {
  fail(
    `expected BAD_MANIFEST for a small zip missing manifest.json, got ${code} ` +
      "— the size/count caps must NOT shadow real validation errors",
  );
}
console.log(`✓ small zip without manifest is rejected on manifest check (code=${code})`);

console.log("\n✓ zip-bomb caps enforced; happy path untouched");
