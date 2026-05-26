import "server-only";
import { generateText } from "ai";

import { resolveModel } from "@/lib/ai/providers";
import type { Locale } from "@/db/schema";
import type { CrawlResult } from "@/lib/brand-profile/crawler";
import {
  parseExtractorOutputMarkdown,
  type ExtractedBrandProfile,
} from "./brand-profile-extractor-parser";

export {
  parseExtractorOutputMarkdown,
  type ExtractedBrandProfile,
} from "./brand-profile-extractor-parser";

/**
 * Brand-profile website extractor.
 *
 * Takes a `CrawlResult` (per-page text + locale annotations from Worktree B's
 * crawler), plus the locale set the marketer ticked, and returns a fully-
 * populated `ExtractedBrandProfile` proposal. The UI lets the marketer review
 * + edit before `applyExtractorProposal` actually writes the brand_profile.
 *
 * The agent emits markdown with one section per axis (Brand name / Tagline /
 * Mission / Values / Locales / Voice / Knowledge / Audiences / Positioning /
 * Competitors). Per-locale axes (voice + audiences) use `### EN` / `### PL`
 * subsections, each containing a JSON block. The parser is tolerant — missing
 * sections fall back to undefined without failing the run.
 */

export interface BrandProfileExtractorInput {
  crawl: CrawlResult;
  /** The locale set the marketer ticked. May or may not match the detected
   *  locales from the crawl — caller decides whether to bias by user choice
   *  or by what the crawler actually saw. */
  locales: Locale[];
}

export interface BrandProfileExtractorResult {
  output: ExtractedBrandProfile;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const MAX_PAGE_CHARS = 3000;
const MAX_PAGES = 20;

const SYSTEM = `You are a senior brand strategist extracting a structured brand profile from a website's content. Marketers will use this as the foundation for an AI copywriting workspace, so accuracy beats speculation.

You receive page-by-page output from a crawler: per-page locale annotation, page title, headings, and a truncated body. Your job is to synthesise across pages into a brand profile.

Quality bar:
  - Only extract what the website ACTUALLY SUPPORTS. If pricing pages don't say "transparent", don't claim transparency is a value.
  - Per-locale extraction: when the crawler tagged pages with locale annotations, build per-locale voice + audience variants from THOSE pages only. Do not mix Polish voice signal with English voice signal.
  - For sites with one locale only, emit just that locale's voice + audience.
  - Knowledge: focus on PRODUCT facts (what they sell, how it works, pricing if visible, geographic coverage). FAQs only if you saw an explicit FAQ page or recurring Q&A pattern.
  - Positioning: differentiators come from comparison-shaped language ("unlike", "while others...", "we believe"). brandValues come from About/Manifesto pages.
  - Competitors: only include if the site explicitly names them (rare). Otherwise emit an empty array.

OUTPUT FORMAT — VERY IMPORTANT.
Output as MARKDOWN with the following sections, in this order. Use the heading text exactly as shown. No code fences around the whole response.

## Brand name
<one line — the brand name as the website presents it>

## Tagline
<the tagline / hero hook as it appears, one line>

## Mission
<1-3 sentences — the brand's mission/purpose statement, as the site presents it. Empty if not stated.>

## Values
<comma-separated list of 3-8 values, or "(none)" if not stated>

## Locales
<comma-separated list of locales the site actually serves: en, pl, ro, uk>

## Voice
For EACH locale you found, a level-3 subsection with the locale code (uppercase) followed by a JSON block:

### EN
\`\`\`json
{
  "toneDescriptors": ["..."],
  "voicePersona": "...",
  "audience": "...",
  "readingLevel": "...",
  "formality": 5,
  "emotionalRegister": "...",
  "dos": [{"rule": "...", "why": "..."}],
  "donts": [{"rule": "...", "why": "..."}],
  "vocabularyPreferences": ["..."],
  "requiredWords": [],
  "forbiddenWords": [],
  "samplePieces": [],
  "fromSampleAnalysis": false
}
\`\`\`

### PL
\`\`\`json
{ ... }
\`\`\`

## Knowledge
A single JSON block:

\`\`\`json
{
  "offerings": [{"name": "...", "description": "...", "category": "..."}],
  "facts": [{"fact": "..."}],
  "faqs": [{"question": "...", "answer": "..."}]
}
\`\`\`

## Audiences
For EACH locale, a level-3 subsection with the locale code followed by a JSON array:

### EN
\`\`\`json
[
  {
    "id": "kebab-case-id",
    "name": "...",
    "demographics": "...",
    "psychographics": "...",
    "painPoints": ["..."],
    "jobsToBeDone": ["..."],
    "decisionCriteria": ["..."]
  }
]
\`\`\`

## Positioning
A single JSON block:

\`\`\`json
{
  "differentiators": ["..."],
  "brandValues": ["..."],
  "standsFor": ["..."],
  "standsAgainst": ["..."]
}
\`\`\`

## Competitors
A single JSON array:

\`\`\`json
[
  {
    "id": "kebab-case-id",
    "name": "...",
    "url": "https://...",
    "positioning": "...",
    "whyTheyWin": ["..."],
    "whyWeWin": ["..."]
  }
]
\`\`\`

If the site did not name competitors, emit \`[]\`.`;

function buildPrompt(input: BrandProfileExtractorInput): string {
  const lines: string[] = [];
  lines.push(`# Crawler output`);
  lines.push(`Final URL: ${input.crawl.finalUrl}`);
  lines.push(`Detected locales: ${input.crawl.detectedLocales.join(", ") || "(none detected)"}`);
  lines.push(`Marketer-confirmed locales: ${input.locales.join(", ")}`);
  lines.push(`JS rendered: ${input.crawl.jsRendered}`);
  lines.push(`Sitemap found: ${input.crawl.sitemapFound}`);
  lines.push(`Robots blocked: ${input.crawl.robotsBlocked}`);
  lines.push(`Pages crawled: ${input.crawl.pages.length}`);
  lines.push("");

  const pages = input.crawl.pages.slice(0, MAX_PAGES);
  pages.forEach((page, i) => {
    lines.push(`---`);
    lines.push(`## Page ${i + 1}`);
    lines.push(`URL: ${page.url}`);
    lines.push(`Locale: ${page.locale ?? "(undetected)"}`);
    lines.push(`Title: ${page.title}`);
    if (page.headings.h1.length) {
      lines.push(`H1: ${page.headings.h1.join(" | ")}`);
    }
    if (page.headings.h2.length) {
      lines.push(`H2: ${page.headings.h2.slice(0, 10).join(" | ")}`);
    }
    if (page.headings.h3.length) {
      lines.push(`H3: ${page.headings.h3.slice(0, 10).join(" | ")}`);
    }
    lines.push("");
    lines.push(page.text.slice(0, MAX_PAGE_CHARS));
    lines.push("");
  });

  lines.push("---");
  lines.push(
    "Now extract the brand profile. Use the markdown format from the system prompt. Per-locale voice + audience subsections are required for every locale you saw distinct content for. If a section has no support in the crawl, omit it entirely rather than inventing.",
  );
  return lines.join("\n");
}

export async function runBrandProfileExtractor(
  input: BrandProfileExtractorInput,
  ctx: { workspaceId: string; userId: string },
): Promise<BrandProfileExtractorResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: "planning",
  });

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(input),
    temperature: 0.4,
    maxOutputTokens: 8000,
  });

  const parsed = parseExtractorOutputMarkdown(result.text);

  return {
    output: parsed,
    modelId,
    provider,
    durationMs: Date.now() - start,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
