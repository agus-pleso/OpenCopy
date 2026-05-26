import "server-only";

import type { SeoCriterionScore } from "@/db/schema";

import { cosineSimilarity, ollamaEmbed } from "./semantic";

/**
 * Content-gap scorer.
 *
 * Compares the document's covered topics against the top-10 SERP pages'
 * covered topics. Topics are taken from each SERP page's h1 + h2
 * outline (headings are an SEO signal that the page covers that subtopic).
 *
 * Pipeline:
 *   1. Build a "topic pool" — every SERP page's h1 + h2 headings.
 *   2. Cluster identical/near-identical topics (cosine ≥ 0.85) so
 *      "Pricing" and "Cena" don't double-count in CEE locales.
 *   3. Topics covered by ≥ 3 of the top-10 pages count as "table stakes"
 *      — the score's denominator.
 *   4. For each table-stakes topic, embed it once and check if any
 *      doc paragraph has cosine ≥ 0.55 against it. If yes → covered;
 *      if no → missing.
 *   5. Score = % covered.
 *
 * Falls back to a neutral 50/100 if embeddings are unavailable (Ollama
 * offline). The scorer is robust to partial SERP results — works with
 * any number of pages, just yields less reliable topic-pool with fewer.
 */

export interface SerpPageOutline {
  url: string;
  title: string;
  h1?: string;
  h2: string[];
}

export interface ContentGapScorerInput {
  /** Doc plain text. */
  text: string;
  /** Top-N SERP results' heading outlines. */
  serpPages: SerpPageOutline[];
  /**
   * How many pages must share a topic for it to be "table stakes".
   * Default 3 (out of typical top-10).
   */
  topicQuorum?: number;
  /**
   * Cosine threshold above which two topics are considered duplicates.
   * Default 0.85.
   */
  duplicateThreshold?: number;
  /**
   * Cosine threshold above which a doc paragraph is considered to
   * "cover" a topic. Default 0.55.
   */
  coverageThreshold?: number;
}

export interface ContentGapDetails extends Record<string, unknown> {
  topicsTotal: number;
  topicsCovered: number;
  missingTopics: string[];
  /** Set when embeddings were unavailable. */
  offline?: boolean;
}

/**
 * Pure helper — gather candidate topics from a SERP outline. Strips
 * obvious garbage headings ("Table of contents", "FAQ", brand names if
 * they leak in).
 */
export function gatherCandidateTopics(
  pages: SerpPageOutline[],
): Array<{ text: string; pageIndexes: number[] }> {
  const NOISE_PATTERNS = [
    /^table of contents$/i,
    /^contents$/i,
    /^spis treści$/i,
    /^cuprins$/i,
    /^зміст$/i,
    /^toc$/i,
    /^faq$/i,
    /^frequently asked/i,
    /^references?$/i,
    /^bibliografia$/i,
    /^sources?$/i,
    /^about( us)?$/i,
    /^o nas$/i,
    /^contact$/i,
    /^kontakt$/i,
    /^sitemap$/i,
  ];
  const isNoise = (s: string) => {
    const t = s.trim();
    if (t.length < 3) return true;
    if (t.length > 120) return true; // too long to be a section heading
    return NOISE_PATTERNS.some((re) => re.test(t));
  };

  // First pass: collect raw (heading text, page index) pairs.
  const pairs: Array<{ text: string; pageIndex: number }> = [];
  pages.forEach((p, i) => {
    if (p.h1 && !isNoise(p.h1)) pairs.push({ text: p.h1, pageIndex: i });
    for (const h2 of p.h2 ?? []) {
      if (!isNoise(h2)) pairs.push({ text: h2, pageIndex: i });
    }
  });

  // Dedupe by exact-normalised string (cheap pre-clustering).
  const exact = new Map<string, { text: string; pageIndexes: Set<number> }>();
  for (const { text, pageIndex } of pairs) {
    const key = text.toLowerCase().trim();
    if (!exact.has(key)) {
      exact.set(key, { text: text.trim(), pageIndexes: new Set([pageIndex]) });
    } else {
      exact.get(key)!.pageIndexes.add(pageIndex);
    }
  }
  return Array.from(exact.values()).map((t) => ({
    text: t.text,
    pageIndexes: Array.from(t.pageIndexes).sort((a, b) => a - b),
  }));
}

/**
 * Split text into "paragraphs" suitable for coverage matching. Falls
 * back to sentence splits if there are no paragraph breaks.
 */
export function splitDocChunks(text: string): string[] {
  if (!text.trim()) return [];
  const byBlank = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);
  if (byBlank.length >= 2) return byBlank;
  // Fall back to sentence groups of ~3.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    const grp = sentences.slice(i, i + 3).join(" ");
    if (grp.length >= 20) groups.push(grp);
  }
  if (groups.length > 0) return groups;
  return text.trim() ? [text.trim()] : [];
}

/**
 * Cluster topics by embedding similarity. Returns one representative
 * text per cluster + the union of source page indexes. Greedy + simple
 * — fine for ~30 candidate topics.
 */
async function clusterTopics(
  candidates: Array<{ text: string; pageIndexes: number[] }>,
  duplicateThreshold: number,
  signal?: AbortSignal,
): Promise<
  Array<{ text: string; pageIndexes: Set<number>; embedding: number[] }>
> {
  const out: Array<{
    text: string;
    pageIndexes: Set<number>;
    embedding: number[];
  }> = [];
  for (const c of candidates) {
    const vec = await ollamaEmbed(c.text, signal);
    // Try to match against existing clusters.
    let matched = false;
    for (const cluster of out) {
      const sim = cosineSimilarity(vec, cluster.embedding);
      if (sim >= duplicateThreshold) {
        for (const p of c.pageIndexes) cluster.pageIndexes.add(p);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push({
        text: c.text,
        pageIndexes: new Set(c.pageIndexes),
        embedding: vec,
      });
    }
  }
  return out;
}

export async function scoreContentGap(
  input: ContentGapScorerInput,
  opts: { signal?: AbortSignal } = {},
): Promise<SeoCriterionScore> {
  const quorum = input.topicQuorum ?? 3;
  const duplicateThreshold = input.duplicateThreshold ?? 0.85;
  const coverageThreshold = input.coverageThreshold ?? 0.55;

  // Empty SERP -> can't measure gap, return neutral.
  if (!input.serpPages || input.serpPages.length === 0) {
    return {
      score: 50,
      details: {
        topicsTotal: 0,
        topicsCovered: 0,
        missingTopics: [],
      } satisfies ContentGapDetails,
    };
  }

  const candidates = gatherCandidateTopics(input.serpPages);
  if (candidates.length === 0) {
    return {
      score: 50,
      details: {
        topicsTotal: 0,
        topicsCovered: 0,
        missingTopics: [],
      } satisfies ContentGapDetails,
    };
  }

  let clusters: Array<{
    text: string;
    pageIndexes: Set<number>;
    embedding: number[];
  }>;
  let docChunkVectors: number[][];
  try {
    clusters = await clusterTopics(candidates, duplicateThreshold, opts.signal);
    const chunks = splitDocChunks(input.text);
    docChunkVectors = await Promise.all(
      chunks.map((c) => ollamaEmbed(c.slice(0, 4000), opts.signal)),
    );
  } catch (err) {
    return {
      score: 50,
      details: {
        topicsTotal: 0,
        topicsCovered: 0,
        missingTopics: [],
        offline: true,
        error: (err as Error).message.slice(0, 200),
      } satisfies ContentGapDetails,
    };
  }

  const tableStakes = clusters.filter((c) => c.pageIndexes.size >= quorum);
  if (tableStakes.length === 0) {
    // No widely-shared topic — content-gap is moot. Return neutral.
    return {
      score: 80,
      details: {
        topicsTotal: 0,
        topicsCovered: 0,
        missingTopics: [],
      } satisfies ContentGapDetails,
    };
  }

  let covered = 0;
  const missingTopics: string[] = [];
  for (const topic of tableStakes) {
    let bestCos = 0;
    for (const chunkVec of docChunkVectors) {
      const sim = cosineSimilarity(topic.embedding, chunkVec);
      if (sim > bestCos) bestCos = sim;
    }
    if (bestCos >= coverageThreshold) {
      covered += 1;
    } else {
      missingTopics.push(topic.text);
    }
  }

  const ratio = covered / tableStakes.length;
  return {
    score: Math.round(ratio * 100),
    details: {
      topicsTotal: tableStakes.length,
      topicsCovered: covered,
      missingTopics: missingTopics.slice(0, 12),
    } satisfies ContentGapDetails,
  };
}
