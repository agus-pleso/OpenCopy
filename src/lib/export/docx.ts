import "server-only";

/**
 * DOCX export — converts HTML to a Microsoft Word document.
 *
 * Uses the `html-to-docx` library which speaks HTML directly. Imported
 * dynamically so it doesn't bloat the build for routes that don't export.
 */

interface DocxExportOptions {
  title: string;
  contentHtml: string;
  meta?: Array<{ label: string; value: string }>;
}

export async function renderDocxExport(
  opts: DocxExportOptions,
): Promise<Buffer> {
  // Dynamic import — html-to-docx is a fairly heavy module.
  const mod = await import("html-to-docx");
  const htmlToDocx = mod.default;

  const metaHtml =
    opts.meta && opts.meta.length > 0
      ? `<p style="color:#666;font-size:11px;font-family:Calibri,sans-serif">${opts.meta
          .map((m) => `<strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(m.value)}`)
          .join(" &nbsp;·&nbsp; ")}</p><hr/>`
      : "";

  const styledHtml = `<!DOCTYPE html><html><body>
<h1 style="font-family:Calibri,sans-serif">${escapeHtml(opts.title)}</h1>
${metaHtml}
${opts.contentHtml}
</body></html>`;

  const result = await htmlToDocx(styledHtml, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    title: opts.title,
  });

  // html-to-docx returns either a Buffer (Node) or a Blob (browser/edge).
  if (result instanceof Buffer) return result;
  // Convert Blob → Buffer.
  const ab = await (result as Blob).arrayBuffer();
  return Buffer.from(ab);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
