// Regression test for the "weak ENCRYPTION_KEY accepted silently" bug.
//
// Before the fix, src/lib/crypto.ts accepted any ENCRYPTION_KEY value and
// silently stretched short or non-base64 inputs to 32 bytes via a single
// round of SHA-256. That meant production deployments could ship with a
// passphrase-like key (e.g. "secret") and never get the loud feedback
// they need that they have effectively zero entropy.
//
// The fix: in production, require ENCRYPTION_KEY to decode to exactly 32
// bytes from base64. Anything else throws at first use. Outside production
// the SHA-256 stretching path remains, so dev / test environments don't
// regress.
//
// This test:
//   1. Sets NODE_ENV=production and ENCRYPTION_KEY="tooshort", confirms
//      encryptSecret() throws.
//   2. Sets NODE_ENV=production and a valid 32-byte base64 key, confirms
//      encryptSecret() works.
//   3. Sets NODE_ENV=development and ENCRYPTION_KEY="tooshort", confirms
//      encryptSecret() STILL works (fallback preserved outside prod).
//
//   pnpm tsx scripts/test-encryption-key-strict.ts
//
// MEDIUM — weak ENCRYPTION_KEY fallback (v2.5.0).

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function freshImport(): Promise<typeof import("../src/lib/crypto")> {
  // getKey() reads process.env lazily inside the module, so we don't actually
  // need to cache-bust between scenarios — toggling env vars between calls
  // is enough. Kept the helper as a single hook for future hardening.
  return import("../src/lib/crypto");
}

async function main() {
  // 1. NODE_ENV=production + short key → throws
  console.log("→ NODE_ENV=production, ENCRYPTION_KEY='tooshort'");
  {
    process.env.NODE_ENV = "production";
    process.env.ENCRYPTION_KEY = "tooshort";
    const mod = await freshImport();
    let threw = false;
    let msg = "";
    try {
      mod.encryptSecret("payload");
    } catch (err) {
      threw = true;
      msg = (err as Error).message;
    }
    if (!threw) {
      fail(
        "encryptSecret() did not throw on a non-32-byte key in production — " +
          "the silent SHA-256 stretch is still active, weak keys ship undetected",
      );
    }
    console.log(`✓ encryptSecret threw: ${msg.slice(0, 100)}`);
  }

  // 2. NODE_ENV=production + valid 32-byte base64 → encrypts cleanly
  console.log(
    "\n→ NODE_ENV=production, ENCRYPTION_KEY=<valid 32-byte base64>",
  );
  {
    process.env.NODE_ENV = "production";
    // 32 'A' bytes → 44-char base64 ending in '='. All-zero key, fine for test.
    process.env.ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const mod = await freshImport();
    try {
      const enc = mod.encryptSecret("hello");
      const dec = mod.decryptSecret(enc);
      if (dec !== "hello") fail(`round-trip lost data: got ${dec}`);
      console.log("✓ valid 32-byte key encrypts/decrypts cleanly");
    } catch (err) {
      fail(`valid key unexpectedly threw: ${(err as Error).message}`);
    }
  }

  // 3. NODE_ENV=development + short key → falls back to SHA-256 stretch (legacy)
  console.log("\n→ NODE_ENV=development, ENCRYPTION_KEY='tooshort'");
  {
    process.env.NODE_ENV = "development";
    process.env.ENCRYPTION_KEY = "tooshort";
    const mod = await freshImport();
    try {
      const enc = mod.encryptSecret("dev-secret");
      const dec = mod.decryptSecret(enc);
      if (dec !== "dev-secret") fail("dev round-trip lost data");
      console.log(
        "✓ stretching fallback works outside production (dev/test keep going)",
      );
    } catch (err) {
      fail(
        `dev-mode encryption should still work with weak keys, got: ${(err as Error).message}`,
      );
    }
  }

  // 4. NODE_ENV=production + base64 that decodes to wrong length → throws
  console.log("\n→ NODE_ENV=production, base64 that decodes to 24 bytes");
  {
    process.env.NODE_ENV = "production";
    // 24 'A' bytes → base64 has 32 chars (no '=' needed). Decodes to 24 bytes.
    process.env.ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const mod = await freshImport();
    let threw = false;
    try {
      mod.encryptSecret("payload");
    } catch {
      threw = true;
    }
    if (!threw) {
      fail("encryptSecret() accepted a 24-byte key in production");
    }
    console.log("✓ wrong-length base64 also throws in production");
  }

  console.log(
    "\n✓ ENCRYPTION_KEY strictness: required 32 bytes in production, legacy stretch in dev",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
