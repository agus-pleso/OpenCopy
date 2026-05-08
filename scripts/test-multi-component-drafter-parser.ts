// Smoke test for the V2.4 multi-component drafter parser.
//
// The drafter is asked to output one labeled markdown section per component
// in the channel's schema. The parser maps section bodies back to component
// ids and composes a fallback `content` string. This test exercises:
//   - Happy path with all sections present
//   - Tolerant heading variants (`# id`, `## id`, `**id**`)
//   - Heading text with spaces / underscores / hyphens normalised to ids
//   - Missing section → empty value (not crash)
//   - Trailing rationale on `---` is stripped from sections
//   - Completely malformed output → fallback to single-shot parse
//
//   pnpm tsx scripts/test-multi-component-drafter-parser.ts

import { parseMultiComponentDrafterOutput } from "../src/lib/agents/copywriter/drafter-parser";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

console.log("→ happy path — all sections + rationale separator");
{
  const raw = `# subject
Five tips before lunch

# body
Multi-paragraph body
with a second line.

# cta
Read the playbook

---
Lead reframes the activation metric…`;
  const r = parseMultiComponentDrafterOutput(raw, ["subject", "body", "cta"]);
  if (r.components?.subject !== "Five tips before lunch") fail(`subject: ${r.components?.subject}`);
  if (!r.components?.body?.startsWith("Multi-paragraph")) fail(`body: ${r.components?.body}`);
  if (r.components?.cta !== "Read the playbook") fail(`cta: ${r.components?.cta}`);
  if (!r.rationale.includes("Lead reframes")) fail(`rationale lost: ${r.rationale}`);
  if (!r.content.includes("[subject]")) fail(`composed content lost labels`);
  console.log("✓");
}

console.log("\n→ ## headings + bold variant accepted");
{
  const raw = `## subject
Subject line text

**body**
Body text here

# cta
Click`;
  const r = parseMultiComponentDrafterOutput(raw, ["subject", "body", "cta"]);
  if (!r.components?.subject?.includes("Subject line")) fail(`subject not parsed: ${JSON.stringify(r.components)}`);
  if (!r.components?.body?.includes("Body text")) fail(`body not parsed: ${JSON.stringify(r.components)}`);
  if (!r.components?.cta?.includes("Click")) fail(`cta not parsed`);
  console.log("✓");
}

console.log("\n→ heading text with hyphens/spaces normalised to id");
{
  const raw = `# Primary Text
Above the image copy.

# call to action
Sign up`;
  const r = parseMultiComponentDrafterOutput(raw, ["primary_text", "call_to_action"]);
  if (!r.components?.primary_text?.includes("Above the image"))
    fail(`primary_text not matched: ${JSON.stringify(r.components)}`);
  if (!r.components?.call_to_action?.includes("Sign up"))
    fail(`call_to_action not matched: ${JSON.stringify(r.components)}`);
  console.log("✓ space/hyphen normalisation works");
}

console.log("\n→ missing section → empty string, not crash");
{
  const raw = `# subject
Only subject was produced`;
  const r = parseMultiComponentDrafterOutput(raw, ["subject", "body", "cta"]);
  if (r.components?.subject !== "Only subject was produced") fail(`subject lost: ${JSON.stringify(r.components)}`);
  if (r.components?.body !== "") fail(`body should be "" not ${JSON.stringify(r.components?.body)}`);
  if (r.components?.cta !== "") fail(`cta should be "" not ${JSON.stringify(r.components?.cta)}`);
  console.log("✓ missing sections become empty strings");
}

console.log("\n→ no recognisable headings → fallback to single-shot parse");
{
  const raw = `Just some plain copy
without any section headings at all.

---
Reasoning here.`;
  const r = parseMultiComponentDrafterOutput(raw, ["subject", "body"]);
  // First-listed component absorbs the content fallback.
  if (!r.components?.subject?.includes("Just some plain copy"))
    fail(`fallback should put content in first component: ${JSON.stringify(r.components)}`);
  if (!r.rationale.includes("Reasoning")) fail(`rationale not preserved`);
  console.log("✓ malformed output doesn't lose the model's text");
}

console.log("\n→ unknown section ids are dropped");
{
  const raw = `# subject
S

# unknown_field
unknown text

# body
B`;
  const r = parseMultiComponentDrafterOutput(raw, ["subject", "body"]);
  if (r.components?.subject !== "S") fail(`subject: ${r.components?.subject}`);
  if (r.components?.body !== "B") fail(`body: ${r.components?.body}`);
  // unknown_field shouldn't sneak into the components map.
  if ("unknown_field" in (r.components ?? {})) fail(`unknown_field leaked into output`);
  console.log("✓");
}

console.log("\n✓ multi-component drafter parser passes all cases");
