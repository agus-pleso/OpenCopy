import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { copyVariants, campaignAssets } from "@/db/schema";
import { getCurrentWorkspace, requireRole } from "@/lib/auth/workspace";
import {
  EXPORT_FORMATS,
  renderMarkdownExport,
  renderStandaloneHtml,
  renderDocxExport,
  plainTextToHtml,
  safeFileName,
  type ExportFormat,
} from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const VALID_FORMATS: ExportFormat[] = ["md", "html", "docx"];

/**
 * Library-variant export. Looks up the id first in copy_variants, then in
 * campaign_assets so a single endpoint serves both surfaces.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const formatRaw = url.searchParams.get("format");
  const format = formatRaw as ExportFormat;
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `Unsupported format. Use one of: ${VALID_FORMATS.join(", ")}` },
      { status: 400 },
    );
  }

  let workspaceId: string;
  try {
    const { workspace } = await getCurrentWorkspace();
    await requireRole(workspace.id, "viewer");
    workspaceId = workspace.id;
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 401 },
    );
  }

  // Try copy_variants first.
  const variant = await db.query.copyVariants.findFirst({
    where: and(
      eq(copyVariants.id, id),
      eq(copyVariants.workspaceId, workspaceId),
    ),
    with: { voice: { columns: { id: true, name: true } } },
  });

  let title = "Variant";
  let body = "";
  const meta: Array<{ label: string; value: string }> = [];

  if (variant) {
    title = variant.label || "Variant";
    body = variant.refinedContent ?? variant.content;
    if (variant.voice?.name) meta.push({ label: "Voice", value: variant.voice.name });
    meta.push({ label: "Locale", value: variant.locale.toUpperCase() });
    if (variant.auditScore != null) {
      meta.push({ label: "Voice score", value: `${variant.auditScore}/100` });
    }
  } else {
    // Fall back to campaign_assets.
    const asset = await db.query.campaignAssets.findFirst({
      where: and(
        eq(campaignAssets.id, id),
        eq(campaignAssets.workspaceId, workspaceId),
      ),
      with: { voice: { columns: { id: true, name: true } } },
    });
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    title = asset.label || asset.channel;
    body = asset.content;
    if (asset.voice?.name) meta.push({ label: "Voice", value: asset.voice.name });
    meta.push({ label: "Channel", value: asset.channel });
    meta.push({ label: "Locale", value: asset.locale.toUpperCase() });
    if (asset.auditScore != null) {
      meta.push({ label: "Voice score", value: `${asset.auditScore}/100` });
    }
  }

  const formatMeta = EXPORT_FORMATS.find((f) => f.id === format)!;
  const filename = `${safeFileName(title)}.${formatMeta.extension}`;
  const contentHtml = plainTextToHtml(body);

  if (format === "md") {
    const md = renderMarkdownExport({ title, contentHtml, meta });
    return new NextResponse(md, {
      headers: {
        "Content-Type": `${formatMeta.contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  if (format === "html") {
    const html = renderStandaloneHtml({ title, contentHtml, meta });
    return new NextResponse(html, {
      headers: {
        "Content-Type": `${formatMeta.contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  if (format === "docx") {
    try {
      const buf = await renderDocxExport({ title, contentHtml, meta });
      const bytes = new Uint8Array(buf);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": formatMeta.contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(bytes.byteLength),
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: `DOCX export failed: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "Unreachable" }, { status: 500 });
}
