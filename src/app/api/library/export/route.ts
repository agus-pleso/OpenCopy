import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { listLibraryVariants } from "@/server/actions/agents";

export const runtime = "nodejs";

/**
 * GET /api/library/export?format=json|csv|md
 *
 * Streams the workspace's saved library variants in the requested format.
 * The current user must be signed in and belong to the workspace they are
 * viewing — listLibraryVariants enforces that.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const variants = await listLibraryVariants({ status: "saved" });
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const body = JSON.stringify(
      variants.map((v) => ({
        id: v.id,
        runId: v.runId,
        kind: v.run?.kind,
        voice: v.voice ? { id: v.voice.id, name: v.voice.name } : null,
        locale: v.locale,
        label: v.label,
        content: v.refinedContent ?? v.content,
        rawContent: v.content,
        refinedContent: v.refinedContent,
        auditScore: v.auditScore,
        savedAt: v.savedAt,
        createdAt: v.createdAt,
      })),
      null,
      2,
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="library-${stamp}.json"`,
      },
    });
  }

  if (format === "csv") {
    const header = [
      "id",
      "runId",
      "kind",
      "voiceName",
      "locale",
      "label",
      "auditScore",
      "savedAt",
      "content",
    ];
    const rows = variants.map((v) => [
      v.id,
      v.runId,
      v.run?.kind ?? "",
      v.voice?.name ?? "",
      v.locale,
      v.label ?? "",
      v.auditScore?.toString() ?? "",
      v.savedAt?.toISOString?.() ?? "",
      v.refinedContent ?? v.content,
    ]);
    const body =
      [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
      "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="library-${stamp}.csv"`,
      },
    });
  }

  if (format === "md") {
    const lines: string[] = [];
    lines.push(`# Library — ${stamp}`);
    lines.push("");
    for (const v of variants) {
      const heading = v.label ?? `Variant ${v.id.slice(0, 8)}`;
      lines.push(`## ${heading}`);
      lines.push("");
      const meta: string[] = [];
      if (v.run?.kind) meta.push(`**Kind:** ${v.run.kind}`);
      if (v.voice) meta.push(`**Voice:** ${v.voice.name}`);
      meta.push(`**Locale:** ${v.locale.toUpperCase()}`);
      if (v.auditScore != null) meta.push(`**Audit:** ${v.auditScore}`);
      if (v.savedAt) {
        const t = v.savedAt instanceof Date ? v.savedAt : new Date(v.savedAt);
        meta.push(`**Saved:** ${t.toISOString().slice(0, 10)}`);
      }
      lines.push(meta.join(" · "));
      lines.push("");
      lines.push(v.refinedContent ?? v.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="library-${stamp}.md"`,
      },
    });
  }

  return NextResponse.json(
    { error: `unsupported format: ${format}` },
    { status: 400 },
  );
}

function csvCell(v: string): string {
  if (v == null) return "";
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
