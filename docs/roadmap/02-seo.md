# SEO companion

> SEO becomes a first-class layer alongside copywriting and localization. **Three workflows in one feature** so SEO meets the marketer wherever they are: sidebar (always-on), pre-flight (declare targets up front), or audit (write freely, score after). Hybrid data tier: free baseline + BYOK paid + (long-term, out of scope) OpenCopy's own proprietary indexer.

Master roadmap: [../ROADMAP.md](../ROADMAP.md)

---

## Vision

SEO meets the marketer in whichever working style they prefer:

1. **Companion sidebar** — always-present panel beside the editor. Live keyword coverage, SERP intent, semantic SEO score, suggestions update as the marketer writes / generates. SEO-first writers leave it open.
2. **Pre-flight targets** — declared up front before generation (*target keyword: X, audience: Y, search intent: informational*). Agents bake SEO into the copy from word one. Fire-and-forget for SEO-aware writers.
3. **Post-hoc audit** — write freely, hit *Audit SEO* on a finished doc. Get a score, target-keyword fit, and suggested rewrites for thin spots. The brand-voice-first workflow with SEO as second-pass polish.

**Data tier**:
- **Free baseline** (Google Trends, GSC BYOK, Wikipedia entity graph, semantic SEO via embeddings) ships with every OpenCopy install.
- **BYOK paid** (user's own SEMrush / Ahrefs / DataForSEO key) unlocks search volume, keyword difficulty, competitor SERP analysis.
- **Proprietary SEO data** (OpenCopy's own SERP indexer) is a long-term ambition for a hosted/paid tier — **explicitly out of initial scope**, captured in [Future](#future-proprietary-seo-data).

**Locale**: per-locale SEO behavior is first-class. google.pl, google.ro, google.com.ua. Per-locale keyword pools. Per-locale search behavior patterns.

---

## User flows

### Flow 1 — Companion sidebar (SEO-first writer)

**Trigger**: marketer opens a doc with SEO sidebar enabled.

1. Sidebar prompts for a target keyword on doc creation.
2. As marketer writes or generates, sidebar updates live:
   - **Primary keyword coverage** — count, position (first 100 words? in H1? in conclusion?), prominence.
   - **Semantic SEO score** — embedding similarity to a topic-pool (no API needed; cheap and locale-friendly).
   - **SERP intent fit** — informational / transactional / navigational / commercial. Does the copy match what's actually ranking?
   - **Suggested LSI keywords** — related terms the top-ranking pages use.
   - **Suggested H2/H3 headings** — based on People Also Ask + competitor outlines (paid tier for full quality).
3. Marketer can click *Improve this section* — opens an inline copilot that rewrites to incorporate target keyword + LSI more cleanly.

### Flow 2 — Pre-flight targets (fire-and-forget)

**Trigger**: marketer creates a doc with `SEO mode: pre-flight` selected.

1. Form before generation:
   - Target keyword
   - Secondary keywords (optional)
   - Target audience (pre-filled from brand profile)
   - Search intent (drop-down: informational / commercial / transactional / navigational)
   - Target word count (drop-down: ~500 / ~1000 / ~1500+ / let AI decide)
   - Competitors to outrank (optional, paste URLs)
2. Generation proceeds; SEO targets are injected into the copywriter agent's system prompt + user brief.
3. Output is SEO-optimized from word one. No sidebar needed.

### Flow 3 — Post-hoc audit (brand-voice-first writer)

**Trigger**: marketer hits *Audit SEO* button on an existing doc.

1. Optionally specify target keyword (or AI infers from content).
2. Audit produces:
   - **Composite score** (0-100)
   - **Per-criterion breakdown** — keyword density, semantic coverage, intent fit, structure (headings), length, readability.
   - **Top 3 suggested edits** — rewrite specific paragraphs, add a missing section, tighten an over-long one.
3. Marketer clicks *Apply suggestion* — inline rewrite proposal opens, accept / reject / edit.

---

## Data sources

### Free baseline (always available)

| Source | What it gives | Cost / availability |
|---|---|---|
| **Google Trends** | Keyword popularity trends, related queries, regional interest. | Free, unofficial API (rate limits apply). |
| **Google Search Console** (BYOK) | Marketer's own search performance — clicks, impressions, position, queries. | Free, requires marketer's Google OAuth. |
| **Wikipedia entity graph** | Topic / entity expansion, related concepts, disambiguation. | Free, public dumps + API. |
| **Public SERP scraping** (limited) | Top-10 organic results structure for a query. | Free, respect robots.txt + 2 req/s rate limit. |
| **Embeddings-based semantic SEO** | Topic similarity score for a piece. No keyword pool needed. | Local inference via Ollama or BYOK OpenAI. |

### BYOK paid (user provides their own key)

| Vendor | What it gives | Why BYOK |
|---|---|---|
| **SEMrush API** | Search volume, KD, SERP features, competitor analysis. | Marketer already pays SEMrush — just plug the key in. |
| **Ahrefs API** | Same axes as SEMrush + deeper backlink data. | Same. |
| **DataForSEO** | Cheaper alternative; raw SERP API + keyword data. | Right pick for budget-conscious teams. |

OpenCopy detects which vendor's key is connected and uses it for the relevant features. If none is connected, falls back to free baseline. UI says clearly which features are "free baseline" vs. "needs BYOK SEMrush" so marketers know what they're missing.

### Future: proprietary SEO data

**Explicitly out of initial scope.** Long-term ambition:
- OpenCopy crawls + indexes SERPs across all four CEE locales over time.
- Builds proprietary keyword volume estimates from accumulated data.
- Distributed indexer architecture — potentially shared across self-hosted installs (opt-in).
- Anti-bot evasion, rate limiting, robots.txt compliance.
- **Paid hosted tier** (not free / not OSS-only) — needs its own roadmap.
- Years of effort for one engineer.

Captured here so the rest of the architecture leaves room for it (e.g., the keyword data layer is abstracted behind an interface from day one).

---

## Per-locale SEO

- **Search domain per locale**:
  - `en` → google.com (or country variant like google.co.uk where relevant)
  - `pl` → google.pl
  - `ro` → google.ro
  - `uk` → google.com.ua
- **Keyword pools per locale** — Polish keywords, Romanian keywords, Ukrainian keywords. Maintained per workspace.
- **Search behavior heuristics per locale** — e.g., Polish users use longer queries; Ukrainian users prefer transactional intent for some categories. Encoded as locale-specific agent prompt addenda. AI-generated + maintainer-reviewed.
- **Localizer integration**: when a piece is localized, its SEO targets are also localized (translate target keyword + look up local equivalent + adjust intent classification for the target market).

---

## Tech sketch

### New agents (in `src/lib/agents/`)
- **`seo-companion.ts`** — drives the sidebar's live updates.
- **`seo-pre-flight-planner.ts`** — turns marketer's pre-flight inputs into copywriter agent prompts.
- **`seo-auditor.ts`** — runs the post-hoc audit + generates suggestions.
- **`seo-keyword-researcher.ts`** — calls Google Trends + BYOK APIs to surface keyword candidates.
- **`seo-semantic-scorer.ts`** — embedding-based topic similarity. No external APIs. Locale-friendly.

### New tables (Drizzle, in `src/db/schema.ts`)
- `seo_targets` — per-doc SEO config (target keyword, audience, intent, etc.).
- `seo_keyword_pools` — per-workspace + per-locale keyword library.
- `seo_audit_reports` — historical audits + suggestions (for trend tracking + re-audit).
- `seo_api_keys` — BYOK SEMrush/Ahrefs/DataForSEO/GSC credentials. **Encrypted via existing `src/lib/crypto.ts`.** (The v2.5.1 strict ENCRYPTION_KEY validation already covers this.)

### Integration with existing primitives
- **Copywriter agent** accepts new optional fields: `seo_target_keyword`, `seo_intent`, `seo_audience`. When present, weaves them into output.
- **Localizer agent** accepts a per-target-locale SEO target mapping (so localized pieces target locale-specific keywords, not just a translated version of the source keyword).

---

## Open questions

1. **Schema markup (JSON-LD) generation** — produce structured-data for marketers? Probably out of scope; technical SEO is its own domain.
2. **Content briefs** — generate a structured brief (headings outline, key points, target word count) from a keyword target → feed into copywriter. Probably **in** scope; it's a natural extension of pre-flight mode.
3. **Competitor SERP analysis** — lift top-10 patterns for a target keyword (structure, headings, length). Paid-tier-only feature?
4. **Internal linking suggestions** — within a workspace's existing pieces. Probably nice-to-have, not core.
5. **Position tracking** — track how published pieces rank over time. Probably out (analytics is a separate domain).
6. **Audit cadence** — auto-run on every doc save (perf cost) or only on-demand (button click)? Probably on-demand for initial scope.
7. **Multi-keyword target** — pre-flight currently allows one primary + N secondary. Should the audit also support a cluster (3-5 closely related keywords)?

---

## Out of initial scope

- Backlink analysis.
- Technical SEO (schema validators, page speed checks, robots.txt analysis).
- Position tracking over time.
- Multi-page site audits (auditing a whole site, not just one doc).
- Schema markup (JSON-LD) generation for the doc.
- A/B testing of SEO targets.
- Proprietary SEO indexer (deferred — see [Future](#future-proprietary-seo-data)).
