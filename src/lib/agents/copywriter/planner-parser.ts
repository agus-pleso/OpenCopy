/**
 * Pure parser for copywriter planner output. Lives outside server-only so
 * it can be unit-tested directly from a Node script.
 */

export interface PlannerAngle {
  label: string;
  strategy: string;
  hook: string;
  must_include: string[];
  avoid: string[];
}

export interface PlannerOutput {
  insight: string;
  angles: PlannerAngle[];
}

function splitSections(md: string): Array<{ title: string; body: string; level: number }> {
  const cleaned = md
    .replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*)\n?```\s*$/i, "$1")
    .trim();
  const headingRe = /^(?:(#{1,4})\s+(.+?)|\*\*(.+?)\*\*)\s*:?\s*$/gm;
  const matches: Array<{ title: string; level: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(cleaned))) {
    const level = m[1] ? m[1].length : 3;
    const title = (m[2] ?? m[3] ?? "").trim();
    matches.push({ title, level, start: m.index, end: m.index + m[0].length });
  }
  return matches.map((cur, i) => ({
    title: cur.title,
    level: cur.level,
    body: cleaned
      .slice(cur.end, matches[i + 1]?.start ?? cleaned.length)
      .trim(),
  }));
}

function pluckField(body: string, label: string): string | undefined {
  // Match either "**Label:** value" or "Label: value"
  const re = new RegExp(
    `^\\s*(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`,
    "im",
  );
  const m = body.match(re);
  return m ? m[1].trim() : undefined;
}

function pluckList(body: string, label: string): string[] {
  const raw = pluckField(body, label);
  if (!raw) return [];
  // "—" / "none" / "(none)" / "" mean empty.
  if (/^\s*(?:—|–|-{1,3}|none|n\/a|\(none\)|\(empty\))\s*$/i.test(raw)) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .map((s) => s.replace(/^["']|["']$/g, "").replace(/\.$/, "").trim())
    .filter((s) => s.length > 0 && s.length <= 80)
    .slice(0, 8);
}

export function parsePlannerMarkdown(raw: string): PlannerOutput {
  const sections = splitSections(raw);

  const insightSec = sections.find((s) => /^insight/i.test(s.title));
  const insight = insightSec?.body || "Insight not extracted from the planner response.";

  // Angles can be either:
  //  - "## Angle 1: Label" / "## Angle: Label" / "### Angle 1 — Label"
  //  - or any heading where the text starts with "angle" (case-insensitive)
  const angleSecs = sections.filter((s) => /^angle\b/i.test(s.title));

  const angles: PlannerAngle[] = angleSecs.map((s) => {
    // Pull a label out of the title: "Angle 1: Anti-jargon" or "Angle 2 — Founder confession"
    const labelMatch = s.title.match(/^angle(?:\s*\d+)?\s*[:—–-]\s*(.+)$/i);
    const fallbackLabel = s.title.replace(/^angle(?:\s*\d+)?\s*[:—–-]?\s*/i, "").trim();
    const label = (labelMatch?.[1]?.trim() || fallbackLabel || "Angle").slice(0, 60);

    const strategy = pluckField(s.body, "Strategy") || "";
    const hook = pluckField(s.body, "Hook") || "";
    const must_include = pluckList(s.body, "Must include");
    const avoid = pluckList(s.body, "Avoid");

    return { label, strategy, hook, must_include, avoid };
  });

  return {
    insight: insight.slice(0, 1200),
    angles: angles
      .filter((a) => a.strategy.length > 0 || a.hook.length > 0 || a.label.length > 0)
      .slice(0, 6),
  };
}
