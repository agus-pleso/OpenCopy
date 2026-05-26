# OpenCopy — Roadmap

> Replaces `docs/PLAN.md` (deleted 2026-05-26 when the prior roadmap was reset). Scope: the next three feature additions to OpenCopy and how they fit together. Sequencing is intentionally not committed yet — see [Sequencing](#sequencing) at the bottom.

---

## Vision

OpenCopy is going from "agentic copywriter with Brand Voice" to a **complete brand-content workspace for in-house CEE marketing teams**. The next three feature additions build on the existing Brand Voice + agent primitives:

1. **Conversational config + website extractor** — kill cold-start form filling. A marketer arrives, talks to OpenCopy for ~20 minutes (or scrapes their website), and walks out with a fully-populated brand profile.
2. **SEO companion** — every generated piece can be SEO-aware. Three workflows in one feature: companion sidebar (always-on), pre-flight targets (declared up front), and post-hoc audit (write freely, score after).
3. **Storytelling tool** — brand storytelling as first-class infrastructure. Marketers build N narrative arcs over time (per campaign / season / product line); every generation can pull from an arc; arcs also drive full multi-channel campaign sequences.

All three are **locale-aware across en/pl/ro/uk** (the four supported locales) and target a **single-brand-per-workspace** model. Per-locale brand voice variants, SEO data, and narrative archetypes are first-class — not afterthoughts.

---

## Persona: Diana

Small in-house marketing team at a CEE company. Owns brand + content. Knows their ICP cold, knows SEO basics, deeply cares about voice fidelity + locale nuance. Not deeply technical but operates the tool daily. Sole engineer (the maintainer) builds for one Diana, but Diana scales: marketing teams at CEE companies have similar shapes.

**What Diana cares about:**
- **Voice fidelity** — the AI sounds like her brand, not "AI brand voice #4".
- **Locale nuance** — a Polish reader gets Polish copy that *reads Polish*, not transcreated English.
- **Speed** — brief → publishable in minutes for ordinary content, hours for campaigns.
- **Brand coherence** — every piece reinforces the same story; campaigns hang together.

**What Diana doesn't care about:**
- Multi-tenant agency workflows (she manages one brand).
- Live multiplayer (export/import is fine; not collaborating in real-time).
- Technical SEO weeds (schema validators, page speed) — developer's problem.

---

## What's in scope

| Feature | One-line summary | Spec |
|---|---|---|
| **Conversational config** | NL chat (deep onboarding + per-tool deep-dives + edit-via-chat) and website extractor that capture voice + knowledge + ICP + positioning with per-locale variants. | [01-conversational-config.md](roadmap/01-conversational-config.md) |
| **SEO companion** | Tri-mode (sidebar + pre-flight + audit) SEO. Free baseline (Google Trends, GSC, semantic) + BYOK SEMrush / Ahrefs / DataForSEO. | [02-seo.md](roadmap/02-seo.md) |
| **Storytelling tool** | Multi-arc workspace. Every arc has narrative + cast + timeline + style anchors. Drives copywriter context, campaign sequences, and long-form pieces. | [03-storytelling.md](roadmap/03-storytelling.md) |

---

## How they relate

```
Conversational config        ←  inputs flow into  →        SEO + Storytelling
       │                                                          │
       │ captures voice, knowledge,                               │ consume voice,
       │ ICP, positioning per locale                              │ ICP, positioning
       │                                                          │
       ↓                                                          ↓
   Brand profile  ── feeds ──→  Existing copywriter  ←── pulls ── Story arcs
                                + new SEO companion              + campaign sequences
```

- Conversational config is **foundational**. Better profile data ⇒ better SEO + storytelling outputs.
- SEO and storytelling are **independent**: can be built in parallel sessions.
- The **website extractor** inside Conversational Config is the most self-contained piece — could ship before the rest of (1) is done.
- Story arcs **feed back into** the existing copywriter: every generation can specify an arc as context.

---

## Cross-cutting concerns

### Locales: en / pl / ro / uk — all first-class

Per-locale assets across every feature:
- **Brand voice**: per-locale variants (Polish reads differently than transcreated English).
- **SEO data**: per-locale SERPs (google.pl, google.ro, google.com.ua) + locale-specific keyword pools.
- **Narrative archetypes**: per-locale cultural references + storytelling structures.

Initial seed data is **AI-generated + maintainer-reviewed** (Claude/GPT generates the Polish narrative archetypes, Romanian SEO keyword pools, etc.; maintainer + native-speaker contributors refine over time). Out of scope: full native-speaker editorial team.

### Multi-brand: single brand per workspace (current model preserved)

Diana's company might have multiple sub-brands. Solution: multiple workspaces, switch between them. The data model stays simple. Multi-brand-within-workspace is **deferred until a real customer surfaces with the need** — don't speculate.

### Brand voice integration: extends, doesn't replace

The existing `voice-analyzer.ts` agent stays. The conversational config wraps it: a chat collects samples + answers, then runs voice-analyzer on the samples to produce the voice card. New per-locale voice variants stored as siblings on the same brand profile.

---

## What's deferred / out

- **Multi-brand per workspace** — wait for customer signal.
- **Performance feedback loops** (did this campaign work?) — out until OpenCopy has analytics.
- **Hosted SaaS tier with proprietary SEO infra** — captured as a long-term ambition but **out of initial scope**. See [02-seo.md → Future](roadmap/02-seo.md#future-proprietary-seo-data).
- **Firebase, live multiplayer, real-time collaboration** — explicitly abandoned (per CLAUDE.md).
- **Schema markup validators, technical SEO scanning** — out of scope for SEO companion.
- **Visual / video copy generation** — text-only.
- **Auto-publishing to channels** — OpenCopy generates copy; marketer publishes manually.

---

## Open questions

These don't block roadmap commitment but need resolution before implementation starts on the affected piece:

1. **Tool-specific config chats — which tools count?** The user said "tiered tool-specific configs" — probably SEO config, storytelling config, localizer config. Maybe per-channel later. See [01](roadmap/01-conversational-config.md#open-questions).
2. **Website extractor depth** — login-gated content (BYOK auth)? Multi-language site detection? Sitemap parsing? See [01](roadmap/01-conversational-config.md#open-questions).
3. **SEO content briefs** — generate a structured brief from a keyword target that feeds the copywriter? See [02](roadmap/02-seo.md#open-questions).
4. **Story arc inter-relationships** — can arcs reference each other (season 2 continues season 1)? Visualization (timeline / calendar)? See [03](roadmap/03-storytelling.md#open-questions).
5. **Versioning across the board** — brand profiles, story arcs, SEO keyword pools all evolve. Snapshot history? Diff view? Roll-back? Decide before implementation.

---

## Sequencing

**Intentionally not decided in this roadmap.** Maintainer will sequence implementation after reviewing the per-feature specs. Likely candidates for the "first wave":

- **Website extractor** (self-contained inside [01], high first-impression value, easiest to demo).
- **SEO post-hoc audit mode** (smallest of the three SEO workflows, no paid-API dependency, lands semantic SEO infra).
- **Story arc data model + manual CRUD** (foundation for the bigger storytelling work; nothing fancy generative-side).

But that's a hint, not a commitment. The actual order gets decided one feature at a time when a focused implementation session starts.
