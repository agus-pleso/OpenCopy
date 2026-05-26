/**
 * Tolerant parser for the brand-profile website-extractor agent's markdown
 * output. Pure — no `server-only` import — so it can be unit-tested directly
 * from a tsx script.
 *
 * Each major section maps to a slice of the BrandProfile shape. Missing
 * sections fall back to undefined / empty defaults — the parser never throws
 * on a partial response.
 *
 * Expected (ideal) output:
 *
 *     ## Brand name
 *     Acme Coffee
 *
 *     ## Tagline
 *     Specialty roasts for people who notice
 *
 *     ## Mission
 *     ...
 *
 *     ## Values
 *     - transparency
 *     - craft
 *
 *     ## Locales
 *     en, pl
 *
 *     ## Voice
 *     ### EN
 *     ```json
 *     { "toneDescriptors": ["..."], "voicePersona": "...", ... }
 *     ```
 *     ### PL
 *     ```json
 *     { ... }
 *     ```
 *
 *     ## Knowledge
 *     ```json
 *     { "offerings": [...], "facts": [...], "faqs": [...] }
 *     ```
 *
 *     ## Audiences
 *     ### EN
 *     ```json
 *     [ {"id": "...", "name": "...", ...}, ... ]
 *     ```
 *
 *     ## Positioning
 *     ```json
 *     { "differentiators": [...], ... }
 *     ```
 *
 *     ## Competitors
 *     ```json
 *     [ {"name": "...", "url": "...", ...} ]
 *     ```
 */

import type {
  BrandProfileAudience,
  BrandProfileCompetitor,
  BrandProfileKnowledge,
  BrandProfilePositioning,
  BrandProfileVoiceVariant,
  Locale,
} from "@/db/schema";
import {
  childSections,
  findSectionLike,
  splitSections,
  unwrapMarkdown,
  parseCommaList,
  type Section,
} from "./markdown-helpers";

const LOCALES = ["en", "pl", "ro", "uk"] as const satisfies readonly Locale[];

export interface ExtractedBrandProfile {
  name?: string;
  tagline?: string;
  mission?: string;
  values?: string[];
  locales?: Locale[];
  voice?: Partial<Record<Locale, BrandProfileVoiceVariant>>;
  knowledge?: BrandProfileKnowledge;
  audiences?: Partial<Record<Locale, BrandProfileAudience[]>>;
  positioning?: BrandProfilePositioning;
  competitors?: BrandProfileCompetitor[];
}

function normalizeLocale(raw: string): Locale | null {
  const tight = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  for (const l of LOCALES) if (tight === l) return l;
  return null;
}

/** Extract a single JSON value from a section body. Returns null on any
 *  failure mode. Tolerant of fenced (```json), bare object, or bare array. */
function extractJson<T>(body: string | undefined): T | null {
  if (!body) return null;
  const fenceMatch = body.match(/```(?:json)?\s*\n([\s\S]+?)\n?```/i);
  let candidate = (fenceMatch ? fenceMatch[1] : body).trim();
  if (/^\(?(none|n\/a|empty|null|nothing)\)?\.?$/i.test(candidate)) return null;

  // Find first { or [ and walk to its matching closer.
  let openIdx = -1;
  let openCh = "";
  let closeCh = "";
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === "{") {
      openIdx = i;
      openCh = "{";
      closeCh = "}";
      break;
    }
    if (c === "[") {
      openIdx = i;
      openCh = "[";
      closeCh = "]";
      break;
    }
  }
  if (openIdx < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;
  for (let i = openIdx; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) return null;
  try {
    return JSON.parse(candidate.slice(openIdx, endIdx + 1)) as T;
  } catch {
    return null;
  }
}

function parseLocalesList(body: string | undefined): Locale[] {
  if (!body) return [];
  const items = parseCommaList(body, 8);
  const out: Locale[] = [];
  for (const it of items) {
    const norm = normalizeLocale(it);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}

/**
 * Within a parent section that contains `### EN` / `### PL` subsections,
 * pull `(locale, jsonBody)` pairs.
 */
function perLocaleJson<T>(
  sections: Section[],
  parent: Section | undefined,
): Partial<Record<Locale, T>> {
  if (!parent) return {};
  const children = childSections(sections, parent);
  const out: Partial<Record<Locale, T>> = {};
  for (const child of children) {
    const norm = normalizeLocale(child.title);
    if (!norm) continue;
    const value = extractJson<T>(child.body);
    if (value !== null) out[norm] = value;
  }
  return out;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function safeStringArr(v: unknown, max = 30): string[] {
  if (!isStringArray(v)) return [];
  return v.map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 400).slice(0, max);
}

function safeStr(v: unknown, max = 800): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function safeNum(v: unknown, fallback: number, min = 0, max = 10): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Coerce arbitrary JSON into a safe BrandProfileVoiceVariant. */
function coerceVoiceVariant(raw: unknown): BrandProfileVoiceVariant | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rules = (val: unknown): { rule: string; why?: string }[] => {
    if (!Array.isArray(val)) return [];
    return val
      .map((item) => {
        if (typeof item === "string") return { rule: item };
        if (item && typeof item === "object" && "rule" in item) {
          const rule = safeStr((item as Record<string, unknown>).rule, 400);
          const why = safeStr((item as Record<string, unknown>).why ?? "", 400);
          if (!rule) return null;
          return why ? { rule, why } : { rule };
        }
        return null;
      })
      .filter((x): x is { rule: string; why?: string } => x !== null)
      .slice(0, 12);
  };
  return {
    toneDescriptors: safeStringArr(r.toneDescriptors ?? r.tone_descriptors, 12),
    voicePersona: safeStr(r.voicePersona ?? r.voice_persona, 800),
    audience: safeStr(r.audience, 600),
    readingLevel: safeStr(r.readingLevel ?? r.reading_level, 60),
    formality: safeNum(r.formality, 5, 1, 10),
    emotionalRegister: safeStr(r.emotionalRegister ?? r.emotional_register, 200),
    dos: rules(r.dos),
    donts: rules(r.donts),
    vocabularyPreferences: safeStringArr(r.vocabularyPreferences ?? r.vocabulary_preferences, 30),
    requiredWords: safeStringArr(r.requiredWords ?? r.required_words, 30),
    forbiddenWords: safeStringArr(r.forbiddenWords ?? r.forbidden_words, 30),
    samplePieces: safeStringArr(r.samplePieces ?? r.sample_pieces, 10),
    fromSampleAnalysis: Boolean(r.fromSampleAnalysis ?? r.from_sample_analysis),
  };
}

function coerceKnowledge(raw: unknown): BrandProfileKnowledge | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const offerings = Array.isArray(r.offerings)
    ? r.offerings
        .map((o): { name: string; description: string; category?: string } | null => {
          if (!o || typeof o !== "object") return null;
          const obj = o as Record<string, unknown>;
          const name = safeStr(obj.name, 200);
          if (!name) return null;
          const category = obj.category ? safeStr(obj.category, 100) : "";
          return category
            ? { name, description: safeStr(obj.description, 1000), category }
            : { name, description: safeStr(obj.description, 1000) };
        })
        .filter(
          (x): x is { name: string; description: string; category?: string } =>
            x !== null,
        )
        .slice(0, 30)
    : [];
  const facts = Array.isArray(r.facts)
    ? r.facts
        .map((f): { fact: string; category?: string } | null => {
          if (typeof f === "string") {
            const fact = safeStr(f, 800);
            return fact ? { fact } : null;
          }
          if (!f || typeof f !== "object") return null;
          const obj = f as Record<string, unknown>;
          const fact = safeStr(obj.fact, 800);
          if (!fact) return null;
          const category = obj.category ? safeStr(obj.category, 100) : "";
          return category ? { fact, category } : { fact };
        })
        .filter(
          (x): x is { fact: string; category?: string } => x !== null,
        )
        .slice(0, 100)
    : [];
  const faqs = Array.isArray(r.faqs)
    ? r.faqs
        .map((f) => {
          if (!f || typeof f !== "object") return null;
          const obj = f as Record<string, unknown>;
          const question = safeStr(obj.question, 400);
          const answer = safeStr(obj.answer, 2000);
          if (!question || !answer) return null;
          return { question, answer };
        })
        .filter((x): x is { question: string; answer: string } => x !== null)
        .slice(0, 50)
    : [];
  return { offerings, facts, faqs };
}

function coerceAudienceList(raw: unknown): BrandProfileAudience[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BrandProfileAudience[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = safeStr(obj.name, 200);
    if (!name) continue;
    const id =
      safeStr(obj.id, 80) ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      `audience-${out.length + 1}`;
    out.push({
      id,
      name,
      demographics: safeStr(obj.demographics, 600),
      psychographics: safeStr(obj.psychographics, 600),
      painPoints: safeStringArr(obj.painPoints ?? obj.pain_points, 15),
      jobsToBeDone: safeStringArr(obj.jobsToBeDone ?? obj.jobs_to_be_done, 15),
      decisionCriteria: safeStringArr(obj.decisionCriteria ?? obj.decision_criteria, 15),
    });
    if (out.length >= 10) break;
  }
  return out;
}

function coercePositioning(raw: unknown): BrandProfilePositioning | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    differentiators: safeStringArr(r.differentiators, 15),
    brandValues: safeStringArr(r.brandValues ?? r.brand_values, 15),
    standsFor: safeStringArr(r.standsFor ?? r.stands_for, 15),
    standsAgainst: safeStringArr(r.standsAgainst ?? r.stands_against, 15),
  };
}

function coerceCompetitorList(raw: unknown): BrandProfileCompetitor[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BrandProfileCompetitor[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = safeStr(obj.name, 200);
    if (!name) continue;
    const id =
      safeStr(obj.id, 80) ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      `competitor-${out.length + 1}`;
    const url = safeStr(obj.url, 500);
    out.push({
      id,
      name,
      url: url || undefined,
      positioning: safeStr(obj.positioning, 600) || undefined,
      whyTheyWin: safeStringArr(obj.whyTheyWin ?? obj.why_they_win, 10),
      whyWeWin: safeStringArr(obj.whyWeWin ?? obj.why_we_win, 10),
    });
    if (out.length >= 10) break;
  }
  return out;
}

export function parseExtractorOutputMarkdown(
  raw: string,
): ExtractedBrandProfile {
  const cleaned = unwrapMarkdown(raw);
  const sections = splitSections(cleaned);

  const out: ExtractedBrandProfile = {};

  const nameSection = findSectionLike(sections, ["brand name", "name"]);
  if (nameSection) {
    const v = safeStr(nameSection.body.split("\n")[0], 200);
    if (v) out.name = v;
  }

  const taglineSection = findSectionLike(sections, ["tagline", "slogan"]);
  if (taglineSection) {
    const v = safeStr(taglineSection.body.split("\n")[0], 400);
    if (v) out.tagline = v;
  }

  const missionSection = findSectionLike(sections, ["mission", "purpose"]);
  if (missionSection) {
    const v = safeStr(missionSection.body, 2000);
    if (v) out.mission = v;
  }

  const valuesSection = findSectionLike(sections, ["values", "brand values"]);
  if (valuesSection) {
    const vs = parseCommaList(valuesSection.body, 12);
    if (vs.length > 0) out.values = vs;
  }

  const localesSection = findSectionLike(sections, ["locales", "languages", "markets"]);
  if (localesSection) {
    const ls = parseLocalesList(localesSection.body);
    if (ls.length > 0) out.locales = ls;
  }

  // Voice (per-locale)
  const voiceSection = findSectionLike(sections, ["voice"]);
  if (voiceSection) {
    const raw = perLocaleJson<unknown>(sections, voiceSection);
    const coerced: Partial<Record<Locale, BrandProfileVoiceVariant>> = {};
    for (const [loc, val] of Object.entries(raw) as [Locale, unknown][]) {
      const v = coerceVoiceVariant(val);
      if (v) coerced[loc] = v;
    }
    if (Object.keys(coerced).length > 0) out.voice = coerced;
  }

  // Knowledge (single JSON object)
  const knowledgeSection = findSectionLike(sections, ["knowledge", "offerings"]);
  if (knowledgeSection) {
    const k = coerceKnowledge(extractJson<unknown>(knowledgeSection.body));
    if (k) out.knowledge = k;
  }

  // Audiences (per-locale array)
  const audienceSection = findSectionLike(sections, ["audiences", "audience"]);
  if (audienceSection) {
    const raw = perLocaleJson<unknown>(sections, audienceSection);
    const coerced: Partial<Record<Locale, BrandProfileAudience[]>> = {};
    for (const [loc, val] of Object.entries(raw) as [Locale, unknown][]) {
      const v = coerceAudienceList(val);
      if (v && v.length > 0) coerced[loc] = v;
    }
    if (Object.keys(coerced).length > 0) out.audiences = coerced;
  }

  // Positioning (single JSON object)
  const positioningSection = findSectionLike(sections, ["positioning"]);
  if (positioningSection) {
    const p = coercePositioning(extractJson<unknown>(positioningSection.body));
    if (p) out.positioning = p;
  }

  // Competitors (single JSON array)
  const compsSection = findSectionLike(sections, ["competitors"]);
  if (compsSection) {
    const c = coerceCompetitorList(extractJson<unknown>(compsSection.body));
    if (c && c.length > 0) out.competitors = c;
  }

  return out;
}
