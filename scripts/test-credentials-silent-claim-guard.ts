// Regression guard for the "credentials silently claim a magic-link user" bug.
//
// Before the fix, the Credentials provider's authorize() callback found
// the existing user by email, checked for a stored credentials row, and if
// none was present quietly upgraded the account by inserting one — using
// whatever password the requester typed. A user who had registered via the
// magic-link flow (emailVerified set, no password) could thus have their
// account "claimed" by anyone who simply POSTed their email + a chosen
// password to the credentials endpoint.
//
// The fix gates the self-serve upgrade on `existing.emailVerified == null`,
// so credentials can only attach to never-claimed (unverified, no-magic-
// link-sign-in) accounts. Verified accounts must complete a real password
// reset flow.
//
// The Credentials provider is a closure inside a `"use server"` NextAuth
// config — direct behavioral testing in plain tsx requires the full
// NextAuth machinery. Instead we assert on the source: the authorize
// callback MUST gate the credentials.insert on an emailVerified check.
//
//   pnpm tsx scripts/test-credentials-silent-claim-guard.ts
//
// MEDIUM — credentials silent-claim (v2.5.0).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "..", "src", "lib", "auth", "auth.ts");
const src = readFileSync(target, "utf-8");

console.log(`→ reading ${target}`);

// Find the authorize callback body. We anchor on `authorize: async` (the
// callback's declaration in the Credentials({...}) factory).
const authStart = src.indexOf("authorize:");
if (authStart < 0) {
  fail("authorize callback not found — refactor or rename?");
}
// Take the slice from `authorize:` until either the next `Credentials(` or
// EOF, whichever is closer. This brackets the relevant code.
const nextCredentials = src.indexOf("Credentials(", authStart + 1);
const segment =
  nextCredentials > 0 ? src.slice(authStart, nextCredentials) : src.slice(authStart);
console.log(`✓ located authorize-callback segment (${segment.length} chars)`);

// 1. The `if (!cred) { db.insert(credentials)... }` block (the credentials
//    silent-attach branch) must be guarded by an emailVerified-null check.
//    Look for `if (!cred)` and confirm the same block also references
//    `emailVerified`. If the guard is missing, this regex will match
//    `!cred` followed by `db.insert` without any `emailVerified` mention
//    in between.
const noCredIdx = segment.indexOf("if (!cred)");
if (noCredIdx < 0) {
  fail(
    "could not locate the `if (!cred)` branch — the authorize callback no longer " +
      "self-upgrades, so the test is stale and needs updating to match the new shape",
  );
}
// Take the next ~600 chars after `if (!cred)` — that should cover the body.
const branchWindow = segment.slice(noCredIdx, noCredIdx + 600);
console.log("✓ located `if (!cred)` self-upgrade branch");

if (!/emailVerified/.test(branchWindow)) {
  fail(
    "the `if (!cred)` self-upgrade branch does not reference `emailVerified` — " +
      "without that check anyone can POST email+password to attach a credential " +
      "to a magic-link-only account and claim it",
  );
}
console.log("✓ self-upgrade branch references emailVerified");

// 2. The branch must reject (return null) when emailVerified is not null.
//    Look for one of the obvious shapes:
//      if (existing.emailVerified !== null) return null;
//      if (existing.emailVerified != null) return null;
//      if (existing.emailVerified) return null;
const rejectsVerified =
  /existing\.emailVerified\s*(?:!==|!=)\s*null\s*\)\s*[\s\S]{0,80}?return\s+null/.test(
    branchWindow,
  ) ||
  /if\s*\(\s*existing\.emailVerified\s*\)\s*[\s\S]{0,80}?return\s+null/.test(
    branchWindow,
  ) ||
  /existing\.emailVerified\s*===?\s*null/.test(branchWindow);
if (!rejectsVerified) {
  fail(
    "the self-upgrade branch references emailVerified but does not actually " +
      "gate on it — verified magic-link accounts can still be claimed",
  );
}
console.log("✓ branch gates the credentials.insert on emailVerified state");

console.log(
  "\n✓ credentials provider cannot silently attach to verified magic-link accounts",
);
