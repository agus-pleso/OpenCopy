import { NextResponse } from "next/server";

import { getDocument } from "@/server/actions/documents";
import {
  EXPORT_FORMATS,
  renderMarkdownExport,
  renderStandaloneHtml,
  renderDocxExport,
  safeFileName,
  type ExportFormat,
} from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const VALID_FORMATS: ExportFormat[] = ["md", "html", "docx"];

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

  let doc;
  try {
    doc = await getDocument(id);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 401 },
    );
  }
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const meta: Array<{ label: string; value: string }> = [];
  if (doc.voice?.name) meta.push({ label: "Voice", value: doc.voice.name });
  meta.push({ label: "Locale", value: doc.locale.toUpperCase() });
  meta.push({ label: "Words", value: doc.wordCount.toLocaleString() });

  const formatMeta = EXPORT_FORMATS.find((f) => f.id === format)!;
  const filename = `${safeFileName(doc.title || "document")}.${formatMeta.extension}`;

  if (format === "md") {
    const md = renderMarkdownExport({
      title: doc.title || "Untitled",
      contentHtml: doc.contentHtml,
      meta,
    });
    return new NextResponse(md, {
      headers: {
        "Content-Type": `${formatMeta.contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "html") {
    const html = renderStandaloneHtml({
      title: doc.title || "Untitled",
      contentHtml: doc.contentHtml,
      meta,
    });
    return new NextResponse(html, {
      headers: {
        "Content-Type": `${formatMeta.contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "docx") {
    try {
      const buf = await renderDocxExport({
        title: doc.title || "Untitled",
        contentHtml: doc.contentHtml,
        meta,
      });
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
