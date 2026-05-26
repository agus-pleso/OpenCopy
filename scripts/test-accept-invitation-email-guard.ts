// Regression guard for the "invitation token grants membership to anyone" bug.
//
// Before the fix, `acceptInvitation(token)` looked up the invitation row by
// `token` only — it never verified that the invitation's `email` matched the
// session user's email. Anyone who got hold of the invite URL could accept
// it as themselves, sidestepping the email-gated membership flow.
//
// The fix loads the session user's email (via `requireUserId` + a `users`
// lookup that already runs in this function) and rejects the request when
// `invitation.email.toLowerCase() !== me.email.toLowerCase()`.
//
// The real `acceptInvitation` lives inside a `"use server"` action file and
// transitively imports `server-only` + NextAuth, both of which make direct
// behavioral testing in plain tsx painful (no real session, no http request
// scope). Instead we statically assert that the source of `invitations.ts`
// contains the email-comparison guard. If someone deletes the guard the
// assertion fails loudly.
//
//   pnpm tsx scripts/test-accept-invitation-email-guard.ts
//
// CRITICAL — invitation-bypass vulnerability (v2.5.0).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "..", "src", "server", "actions", "invitations.ts");
const src = readFileSync(target, "utf-8");

console.log(`→ reading ${target}`);

// Slice the source from "export async function acceptInvitation(" through
// the end of the file — the function body sits somewhere in there. We
// don't try to parse the body precisely; instead we just look at the slice
// that starts at the acceptInvitation declaration and check that the
// security-critical pattern appears between there and the next exported
// declaration (or EOF, whichever comes first).
const fnStart = src.indexOf("export async function acceptInvitation(");
if (fnStart < 0) {
  fail("acceptInvitation export not found — refactor or rename?");
}
const nextExport = src.indexOf("\nexport ", fnStart + 1);
const segment =
  nextExport > 0 ? src.slice(fnStart, nextExport) : src.slice(fnStart);
console.log(`✓ located acceptInvitation segment (${segment.length} chars)`);

// 1) invitation.email must be referenced.
if (!/invitation\.email/.test(segment)) {
  fail(
    "acceptInvitation does not reference `invitation.email` — without that " +
      "any holder of the token can accept the invite for themselves",
  );
}
console.log("✓ references invitation.email");

// 2) Some session-user email must be referenced. We don't pin the variable
//    name — `me.email`, `user.email`, etc. are all acceptable spellings.
const userEmailPatterns = [
  /\bme\.email\b/,
  /\buser\.email\b/,
  /\bsessionUser\.email\b/,
  /\bcurrentUser\.email\b/,
];
const userEmailMatch = userEmailPatterns.some((rx) => rx.test(segment));
if (!userEmailMatch) {
  fail(
    "acceptInvitation does not reference the session user's email " +
      "(`me.email` / `user.email` / etc.) — the email-match guard is missing",
  );
}
console.log("✓ references session user's email");

// 3) A case-insensitive comparison must be present.  `.toLowerCase()` on
//    BOTH sides is the simplest and most common pattern.
const ciCompare =
  /invitation\.email[^;]*?toLowerCase\(\)[\s\S]{0,400}?(?:me|user|sessionUser|currentUser)\.email[^;]*?toLowerCase\(\)/.test(
    segment,
  ) ||
  /(?:me|user|sessionUser|currentUser)\.email[^;]*?toLowerCase\(\)[\s\S]{0,400}?invitation\.email[^;]*?toLowerCase\(\)/.test(
    segment,
  ) ||
  /localeCompare\([^)]*?\{[^}]*?sensitivity:\s*['"]base['"]/.test(segment);
if (!ciCompare) {
  fail(
    "acceptInvitation does not compare invitation.email vs the session " +
      "user's email case-insensitively (expected both sides through " +
      "`.toLowerCase()` or an equivalent ci-compare)",
  );
}
console.log("✓ compares invitation.email vs session-user email case-insensitively");

// 4) The mismatch path must reject — either `throw` or `return { ok: false`.
//    Look at the 800 chars around the first toLowerCase / invitation.email
//    occurrence.
const idx = segment.indexOf("invitation.email");
const window = segment.slice(idx, idx + 800);
const rejects =
  /throw\s+new\s+\w*Error/.test(window) ||
  /return\s*\{\s*ok:\s*false/.test(window);
if (!rejects) {
  fail(
    "the email-mismatch path in acceptInvitation does not reject (no `throw` " +
      "or `return { ok: false }` follows the comparison)",
  );
}
console.log("✓ mismatch path rejects (throws or returns { ok: false })");

console.log("\n✓ acceptInvitation enforces invitation-email vs session-user-email match");
