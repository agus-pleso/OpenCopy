import "server-only";

interface HtmlExportOptions {
  title: string;
  /** Pre-formatted HTML content (Tiptap getHTML() output, or raw markup). */
  contentHtml: string;
  /** Optional metadata block (voice, locale, audit score, etc.) shown at the top. */
  meta?: Array<{ label: string; value: string }>;
}

/** Wraps content in a fully-styled standalone HTML document. The CSS is
 *  inlined so the file works without external assets — and includes
 *  print-friendly @page rules so users can save-as-PDF cleanly. */
export function renderStandaloneHtml(opts: HtmlExportOptions): string {
  const safeTitle = escapeHtml(opts.title);
  const meta = opts.meta ?? [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 2cm 2.5cm; }
  :root {
    --ink: #0e0e0e;
    --muted: #6b7280;
    --accent: #c4501a;
    --rule: #e5dfd5;
    --paper: #faf7f2;
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    padding: 3rem 2rem;
    background: var(--paper);
    color: var(--ink);
    font-family: ui-serif, Georgia, "Iowan Old Style", serif;
    font-size: 16px;
    line-height: 1.65;
    text-rendering: optimizeLegibility;
  }
  .doc {
    max-width: 720px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 3rem 3.5rem;
    box-shadow: 0 1px 0 rgba(0,0,0,0.02);
  }
  @media print {
    body { padding: 0; background: #fff; }
    .doc { border: none; box-shadow: none; padding: 0; max-width: none; }
  }
  h1.doc-title {
    font-family: ui-sans-serif, "Geist", system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-size: 2.25rem;
    line-height: 1.1;
    margin: 0 0 1rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 1rem;
    margin-bottom: 2rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .meta span strong {
    color: var(--ink);
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }
  .content :where(h1,h2,h3,h4) {
    font-family: ui-sans-serif, "Geist", system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .content h1 { font-size: 1.75rem; margin: 2rem 0 0.75rem; }
  .content h2 { font-size: 1.4rem; margin: 1.75rem 0 0.5rem; }
  .content h3 { font-size: 1.15rem; margin: 1.25rem 0 0.5rem; }
  .content p { margin: 0 0 1rem; }
  .content ul, .content ol { padding-left: 1.5rem; margin: 0 0 1rem; }
  .content li { margin-bottom: 0.35rem; }
  .content blockquote {
    margin: 1rem 0;
    padding: 0.5rem 1rem;
    border-left: 2px solid var(--accent);
    background: rgba(196, 80, 26, 0.05);
    color: var(--ink);
    font-style: italic;
  }
  .content code {
    background: rgba(14,14,14,0.06);
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-family: ui-monospace, "SFMono-Regular", monospace;
    font-size: 0.9em;
  }
  .content pre {
    background: rgba(14,14,14,0.04);
    padding: 1rem;
    border-radius: 0.4rem;
    overflow-x: auto;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    line-height: 1.5;
  }
  .content a { color: var(--accent); text-underline-offset: 2px; }
  .content strong { color: var(--ink); font-weight: 600; }
  .footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
    color: var(--muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
</style>
</head>
<body>
  <article class="doc">
    <h1 class="doc-title">${safeTitle}</h1>
    ${
      meta.length > 0
        ? `<div class="meta">${meta
            .map(
              (m) =>
                `<span>${escapeHtml(m.label)} · <strong>${escapeHtml(
                  m.value,
                )}</strong></span>`,
            )
            .join("")}</div>`
        : ""
    }
    <div class="content">${opts.contentHtml}</div>
    <div class="footer">Exported from OpenCopy</div>
  </article>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Convert plain text (with newlines) to minimal HTML — wraps in <p> per
 *  paragraph. Used for variant exports where content is plain text. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
