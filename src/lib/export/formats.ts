/**
 * Shared types + format catalog for the export system. Lives outside
 * server-only modules so client UI can render the format picker without
 * dragging server-only into the bundle.
 */

export type ExportFormat = "md" | "html" | "docx";

export interface ExportFormatMeta {
  id: ExportFormat;
  label: string;
  description: string;
  extension: string;
  contentType: string;
  icon: string; // lucide-react icon name resolved client-side
}

export const EXPORT_FORMATS: ExportFormatMeta[] = [
  {
    id: "md",
    label: "Markdown",
    description: "Clean, plain-text. Pastes anywhere, tracks well in git.",
    extension: "md",
    contentType: "text/markdown",
    icon: "FileText",
  },
  {
    id: "html",
    label: "HTML",
    description:
      "Standalone .html file with editorial styling. Open in any browser → File → Print to save as PDF.",
    extension: "html",
    contentType: "text/html",
    icon: "Globe",
  },
  {
    id: "docx",
    label: "Word (.docx)",
    description: "Microsoft Word / Google Docs / LibreOffice all open it.",
    extension: "docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    icon: "FileType",
  },
];

export function safeFileName(name: string, fallback = "export"): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || fallback;
}
