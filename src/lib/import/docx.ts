import "server-only";
import mammoth from "mammoth";

/**
 * Parse a .docx file (provided as ArrayBuffer / Buffer) into plain text
 * suitable for feeding to an LLM. Uses mammoth in raw-text mode so we get
 * the document's textual content with paragraph/list breaks preserved as
 * newlines, but no HTML markup or styling cruft.
 *
 * Errors out cleanly on non-docx input (mammoth throws "Could not find
 * the body element" or similar) — caller surfaces a friendly message.
 */
export async function parseDocxToText(buffer: ArrayBuffer | Buffer): Promise<string> {
  const arrayBuffer =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  // mammoth's Node entry expects a `{ buffer: Buffer }` input — same lib for both
  // .docx (ZIP-based) and .doc shims. .doc (legacy) is NOT supported and will
  // surface as a parse error; we tell the user that in the UI.
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer: buf });
  // mammoth returns a `messages` array with non-fatal warnings; ignore.
  const text = result.value.trim();
  if (!text) {
    throw new Error("The document appears to be empty.");
  }
  return text;
}

/**
 * Generic plain-text intake — strips zero-width chars, normalises line
 * endings, and trims. Used for paste OR .txt / .md uploads.
 */
export function normalisePastedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍﻿]/g, "")
    .trim();
}
