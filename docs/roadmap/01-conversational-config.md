# Conversational config + website extractor

> Replace cold-start form filling. A marketer arrives at OpenCopy and either talks to it for 20 minutes OR pastes their website URL — and walks out with a complete brand profile (voice + knowledge + ICP + positioning) with per-locale variants. After setup, they can re-open past chats to refine OR use NL commands for quick tweaks.

Master roadmap: [../ROADMAP.md](../ROADMAP.md)

---

## Vision

Two entry paths, same outcome:

- **(a) Chat path** — AI asks 15-25 structured-but-conversational questions over ~20 minutes across four axes (voice, knowledge, audience, positioning).
- **(b) Website extractor path** — paste URL → crawl + LLM-extract → marketer reviews + refines → done in 2-5 minutes.

Either path produces a **complete, structured brand profile** with per-locale variants that every downstream agent (copywriter, localizer, SEO companion, storytelling tool) uses as context.

After initial setup, the marketer can:
- **Re-open past chats** ("Brand voice → Edit conversation") to deepen or revise an axis.
- **Type NL commands** ("make the Polish voice more formal", "add a new ICP: solo freelance designers") to update specific fields without reopening a chat.

---

## User flows

### Flow 1 — First-time onboarding chat

**Trigger**: new workspace, no brand profile yet.

1. AI greets, asks an open question: *"Tell me what your brand does, in one sentence."*
2. AI asks 15-25 structured-but-conversational questions across four axes:
   - **Voice**: tone, formality, vocabulary preferences, dos/don'ts, emotional register.
   - **Knowledge**: what they sell/offer, key facts, FAQs, edge cases.
   - **Audience (ICP)**: who they sell to, pain points, jobs-to-be-done, decision criteria.
   - **Positioning**: competitors, differentiators, brand values, what the brand stands FOR (and against).
3. After each axis, AI shows a draft of the captured field for inline confirmation.
4. AI asks about **locales**: which of en/pl/ro/uk the brand operates in; for each, captures locale-specific voice variations + audience nuance.
5. AI asks for **3-5 sample pieces of copy** (paste in) and runs the existing `voice-analyzer.ts` to produce a voice card → asks user to confirm / edit.
6. Saves brand profile + opens marketer into their first generation.

**Approximate time**: 15-25 minutes. Pausable + resumable.

### Flow 2 — Website extractor

**Trigger**: new workspace, marketer pastes a URL on the empty-state screen.

1. OpenCopy crawls **homepage + 3-5 linked pages** (About, Products/Services, Pricing, Blog index — heuristic).
2. Extraction agent parses crawled content into:
   - **Voice** — from how the brand writes about itself.
   - **Knowledge** — products, services, key facts.
   - **Audience signals** — who the copy seems to address.
   - **Positioning** — claims, comparisons, differentiators.
3. Presents extracted profile in a structured view for **field-by-field review + edit**.
4. AI asks targeted follow-up questions for anything ambiguous (*"Your homepage says 'for ambitious founders' — what stage of founder? Pre-seed? Series A+?"*).
5. Saves refined profile.

**Approximate time**: 2-5 minutes for a brand with a decent static-HTML website.

### Flow 3 — Per-tool deep-dive chats

**Trigger**: marketer enables a new tool (SEO companion, storytelling) and the tool needs specific config.

Examples:
- **SEO deep-dive** (~5 min): SEO targets, what success looks like, baseline keywords, BYOK API key connection.
- **Storytelling deep-dive** (~5 min per arc): captures arc-specific characters, conflict, channels, style anchors.
- **Localizer deep-dive** (~5 min per locale): captures locale-specific voice nuance + transcreation preferences.

Each tool-specific chat is **resumable and re-openable**. Stored as its own transcript thread.

### Flow 4 — Edit-via-chat (after initial setup)

**Mode A — Re-open transcript**:
- Marketer navigates to `Brand profile → Voice → Edit conversation`.
- Loads the original onboarding chat, marketer continues talking.
- Edits update the same field; old answers preserved as conversation history.

**Mode B — NL commands** (no chat re-open):
- Command palette (Cmd+K) or inline "Update brand" button.
- Marketer types: *"make the Polish voice more formal"* or *"add 'never use exclamation marks' to dos/don'ts"*.
- AI confirms what it understood, applies the change, shows before/after diff.

---

## What gets captured (the brand profile schema)

```
BrandProfile {
  // Core identity
  name, tagline, mission, values[]

  // Voice — per locale
  voice: Record<Locale, VoiceCard>
  //   VoiceCard: tone, formality (1-10), vocabulary preferences,
  //              dos[], donts[], emotional register, sample pieces[]

  // Knowledge — products, services, facts
  knowledge: {
    offerings: Offering[]
    facts: Fact[]
    faqs: FAQ[]
  }

  // ICP — per locale (different markets, different audiences)
  audiences: Record<Locale, Audience[]>
  //   Audience: name, demographics, psychographics,
  //             pain_points, jobs_to_be_done, decision_criteria

  // Positioning
  positioning: {
    competitors: Competitor[]
    differentiators: string[]
    brand_values: string[]
    stands_for: string[]
    stands_against: string[]
  }

  // Locales the brand actually operates in (subset of [en, pl, ro, uk])
  locales: Locale[]
}
```

All fields are **versioned** (snapshot history). Marketers can roll back if a chat edit goes sideways.

---

## Website extractor — technical sketch

- **Crawler**: `cheerio` or `linkedom` for HTML parsing. **No headless browser** (too heavy for self-hosted installs). Static HTML only.
- **Page selection**: heuristic for "important pages":
  - Homepage (root URL)
  - Pages linked from primary nav (About, Products, Pricing, Blog index)
  - Cap: 5-7 pages per crawl
- **Multi-language site detection**: try common patterns (`/pl/`, `/ro/`, `?lang=pl`, `hreflang` tags). For each detected locale, extract a separate voice + audience profile.
- **LLM parsing**: feed extracted text + structured nav to an extraction agent. Agent uses **markdown-output + tolerant parser pattern** (per `voice-analyzer.ts`).
- **Rate limiting**: respect `robots.txt`; max 2 req/s; abort if site blocks scrapers.
- **Failure modes**:
  - Site is fully JS-rendered → fallback to "paste your copy manually" + flag with explanation.
  - Site is password-gated → ditto.
  - `robots.txt` disallows → ditto.
  - Site is too large (e.g., e-commerce with 10k products) → limit to top-level pages; offer "deep extract" later.

---

## Tech sketch

### New agents (in `src/lib/agents/`)
- **`brand-profile-conversationalist.ts`** — drives the chat (turn-by-turn questions, captures answers into typed schema).
- **`brand-profile-extractor.ts`** — drives website extraction (crawl → extract → propose profile).
- **`brand-profile-editor.ts`** — handles NL commands (*"update Polish voice to ..."*).

### New tables (Drizzle, in `src/db/schema.ts`)
- `brand_profiles` — current state, mostly JSONB for the schema flexibility.
- `brand_profile_revisions` — snapshot history (full profile copies, not diffs — simpler).
- `brand_profile_chats` — transcript threads (one per axis or per tool, resumable).
- `brand_profile_chat_messages` — individual turns.
- `brand_profile_crawls` — cached website extraction results (URL → extracted content + timestamp, for redo without re-crawl).

### Integration with existing primitives
- `voice-analyzer.ts` is called from inside the conversationalist when the marketer pastes sample copy → output becomes the voice card.
- The existing `Agent` primitive in `src/lib/agents/` is the substrate.

---

## Locale handling

- Each axis of the brand profile has **per-locale variants** where it matters (voice, audiences).
- **Initial setup**: the conversationalist asks which locales the brand operates in, then probes for locale-specific nuance per axis.
- **Website extractor**: detects multi-language sites and extracts per-locale variants automatically.
- **AI-generated seed data** for locale-specific behavior (Polish formality norms, Romanian directness, Ukrainian register conventions) lives in the agent prompts. Maintainer reviews + refines as native-speaker feedback comes in.

---

## Dependencies

- **Brand voice (existing)** — wrapped, not replaced.
- **No dependency on SEO companion or storytelling tool.** (1) can ship standalone.
- (2) and (3) **depend on** (1) for high-quality outputs, but can be developed in parallel using a stub brand profile.

---

## Open questions

1. **Tool-specific config chats — which tools count?** Probably SEO config, storytelling config, localizer config. Maybe per-channel later (LinkedIn voice vs. email voice).
2. **Website extractor depth**:
   - Just static HTML, or render JS-heavy sites (would need Playwright — adds ~200 MB to install)?
   - Login-gated content (BYOK auth)? Probably out for initial scope.
   - Sitemap.xml parsing for broader coverage? Probably nice-to-have, not core.
3. **Conversation pacing**: 15-25 questions in one go vs. AI-adaptive depth (asks more when answers are thin, fewer when they're rich)?
4. **Chat thread storage**: store the literal chat OR store the extracted structured answers + reconstruct chat on re-open? Affects DB size + replay fidelity.
5. **NL command palette UX**: standalone (Cmd+K) or inline on the brand profile page?
6. **Multi-language website crawl**: extract ALL detected locales, or only the ones the workspace operates in?

---

## Out of initial scope

- Configs portable between workspaces (export / import / share).
- A/B testing of brand voice variants ("which variant produces better outputs?").
- LLM-driven config recommendations (*"brands in your industry typically also include X"*).
- Multi-tenant agency view (managing 10 client brands at once).
- Versioned brand profile **branching** (different drafts of brand voice for experiments).
- Rendering JS-heavy sites in the extractor (would need Playwright).
- Crawling login-gated content with BYOK auth.
