/**
 * Text chunking for the knowledge base.
 *
 * Greedy paragraph-based: split on blank lines, accumulate paragraphs into
 * chunks until the token estimate hits the target, then carry the last
 * paragraph forward as overlap so context doesn't get cleaved at boundaries.
 *
 * The token estimate is rough (~4 chars/token, English-skewed). For
 * Polish/Romanian/Ukrainian text we run a bit short on chunks-per-token
 * but the variance is well within OpenAI's 8K input limit per chunk.
 */

export interface Chunk {
  content: string;
  tokenCount: number;
  /** 0-indexed sequence within the source. */
  seq: number;
}

export interface ChunkOptions {
  /** Target tokens per chunk. Default 500 — small enough for retrieval focus. */
  targetTokens?: number;
  /** Tokens to overlap between consecutive chunks for context continuity. */
  overlapTokens?: number;
  /** Hard ceiling per chunk — don't exceed this even if a paragraph is long. */
  maxTokens?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetTokens: 500,
  overlapTokens: 60,
  maxTokens: 1500,
};

export function estimateTokens(text: string): number {
  // Quick estimate. ~4 chars/token in English; multilingual content may
  // be denser, but we use this for batching only.
  return Math.ceil(text.length / 4);
}

/** Split text into paragraphs (blank-line-delimited) preserving non-empty ones. */
function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Hard-split a single oversized paragraph by sentence, then by words if needed. */
function splitOversized(paragraph: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  if (paragraph.length <= maxChars) return [paragraph];

  // Try sentence boundaries first.
  const sentences = paragraph
    .match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [paragraph];

  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf.length + s.length + 1) > maxChars && buf.length > 0) {
      out.push(buf);
      buf = "";
    }
    if (s.length > maxChars) {
      // Sentence itself too big — split by words.
      const words = s.split(/\s+/);
      let wb = "";
      for (const w of words) {
        if ((wb.length + w.length + 1) > maxChars && wb.length > 0) {
          out.push(wb);
          wb = "";
        }
        wb = wb ? wb + " " + w : w;
      }
      if (wb) out.push(wb);
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function chunkText(text: string, opts?: ChunkOptions): Chunk[] {
  const o = { ...DEFAULTS, ...opts };
  const targetChars = o.targetTokens * 4;
  const overlapChars = o.overlapTokens * 4;
  const maxChars = o.maxTokens * 4;

  const paras = paragraphs(text);
  if (paras.length === 0) return [];

  // Pre-split oversized paragraphs.
  const expanded: string[] = [];
  for (const p of paras) {
    const split = splitOversized(p, o.maxTokens);
    expanded.push(...split);
  }

  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;
  let seq = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join("\n\n");
    chunks.push({
      content,
      tokenCount: estimateTokens(content),
      seq: seq++,
    });

    // Build overlap for next chunk: take from the end until we reach overlapChars.
    if (overlapChars > 0 && buffer.length > 1) {
      const tail: string[] = [];
      let tailLen = 0;
      for (let i = buffer.length - 1; i >= 0; i--) {
        const p = buffer[i];
        if (tailLen + p.length > overlapChars && tail.length > 0) break;
        tail.unshift(p);
        tailLen += p.length;
      }
      buffer = tail;
      bufferLen = tail.reduce((a, b) => a + b.length + 2, 0);
    } else {
      buffer = [];
      bufferLen = 0;
    }
  };

  for (const p of expanded) {
    const projected = bufferLen + p.length + (buffer.length > 0 ? 2 : 0);
    if (projected > maxChars && buffer.length > 0) {
      flush();
    } else if (projected > targetChars && buffer.length > 0) {
      flush();
    }
    buffer.push(p);
    bufferLen += p.length + (buffer.length > 1 ? 2 : 0);
  }

  if (buffer.length > 0) {
    const content = buffer.join("\n\n");
    chunks.push({
      content,
      tokenCount: estimateTokens(content),
      seq: seq++,
    });
  }

  return chunks;
}
