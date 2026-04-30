import "server-only";
import TurndownService from "turndown";

let _turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (_turndown) return _turndown;
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
  });

  // Tiptap renders blockquotes with a wrapping `<blockquote><p>...</p></blockquote>`.
  // Default turndown handles this fine — no override needed.

  // Strip data-* attributes Tiptap adds.
  td.addRule("strip-data-attrs", {
    filter: () => false,
    replacement: () => "",
  });

  _turndown = td;
  return td;
}

export function htmlToMarkdown(html: string): string {
  return getTurndown().turndown(html).trim();
}

/** Build a markdown export for a document or variant. Includes a YAML
 *  front-matter block with metadata. */
export function renderMarkdownExport(opts: {
  title: string;
  contentHtml: string;
  meta?: Array<{ label: string; value: string }>;
}): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "${opts.title.replace(/"/g, '\\"')}"`);
  if (opts.meta) {
    opts.meta.forEach((m) => {
      lines.push(
        `${m.label.toLowerCase().replace(/\s+/g, "_")}: "${m.value.replace(
          /"/g,
          '\\"',
        )}"`,
      );
    });
  }
  lines.push(`exported_at: "${new Date().toISOString()}"`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${opts.title}`);
  lines.push("");
  lines.push(htmlToMarkdown(opts.contentHtml));
  return lines.join("\n");
}
