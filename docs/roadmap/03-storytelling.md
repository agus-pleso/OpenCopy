# Storytelling tool

> Brand storytelling becomes first-class **infrastructure**, not a one-off generator. Marketers build out **multiple narrative arcs** in their workspace over time — one per campaign / season / product line / brand moment. Each arc has structure: **narrative + cast + timeline + style anchors**, with **per-locale variants**. The arc library powers three workflows: single long-form piece, coordinated campaign sequence, and ambient generation context for the existing copywriter.

Master roadmap: [../ROADMAP.md](../ROADMAP.md)

---

## Vision

Marketers build a **library of narrative arcs** that evolves with the brand. Each arc is a structured object capturing the story spine, cast, timeline, and style anchors — with per-locale variants because Polish narrative archetypes are different from English ones.

The arc library powers three workflows in one feature ("one tool, three modes"):

1. **Single long-form narrative piece** — one structured story-driven article (~1500-3000 words) from one phrase + one arc. The *founder story / origin story / manifesto* workflow.
2. **Coordinated campaign sequence** — one brief + one arc → N coordinated pieces across channels (blog + email + ad + landing page) with shared narrative spine.
3. **Generation context** — every copywriter generation can specify an arc as context. Output stays narratively coherent with the brand's chosen story.

Marketers maintain N arcs over time. Some are evergreen (the brand origin); some are time-bound (the spring product launch); some come and go (a one-off PR moment).

---

## Story arc structure

```
StoryArc {
  name: string
  status: "draft" | "active" | "archived"

  // Core narrative — the story spine
  narrative: {
    hook: string              // What grabs attention
    conflict: string          // What's wrong with the world
    stakes: string            // Why the conflict matters
    resolution: string        // How the brand resolves it
    moral?: string            // Optional: what the audience learns
  }

  // Cast — the characters in the story
  cast: {
    hero: Character           // Usually the audience
    villain: Character        // The status quo / pain / competitor
    mentor: Character         // Usually the brand
    allies?: Character[]      // Other supportive characters
  }

  // Channels + timeline — the campaign calendar (optional; some arcs are evergreen)
  campaign?: {
    duration_weeks: number
    channels: ChannelPlan[]   // [{ channel: "blog", week: 1, copy_ref: ... }]
  }

  // Reference style anchors — concrete style targets
  references: Reference[]     // [{ type: "ad", name: "Apple 1984", description: ... }]

  // Per-locale variants
  locale_variants: Record<Locale, ArcLocaleVariant>
}

Character {
  name?: string
  role: "hero" | "villain" | "mentor" | "ally"
  description: string         // Who they are, their POV
  motivation: string          // What they want
  arc?: string                // How they change (optional)
}

Reference {
  type: "ad" | "film" | "book" | "campaign" | "song"
  name: string
  description: string         // What about this work the arc emulates
  notes?: string
}

ArcLocaleVariant {
  locale: Locale
  cast_overrides?: Partial<Cast>          // E.g., locale-specific villain framing
  references_overrides?: Reference[]      // E.g., Polish-specific cultural anchors
  cultural_notes: string                  // Polish humor patterns, Romanian directness, etc.
}
```

---

## User flows

### Flow 1 — Build an arc from scratch (guided wizard)

**Trigger**: marketer clicks *New story arc* in the workspace.

1. Wizard walks through the fields:
   - **Name + status**.
   - **Narrative**: AI asks *"What's the conflict your brand resolves?"* → drafts hook + stakes + resolution → marketer refines.
   - **Cast**: defaults pulled from brand profile (hero ≈ ICP, mentor ≈ brand, villain ≈ a competitor or status quo) → marketer customizes.
   - **Channels + timeline**: marketer specifies if applicable. Some arcs are evergreen (no timeline); some are campaigns (6-week duration, channel mix).
   - **References**: marketer adds 2-5 reference style anchors (*"our launch arc should feel like Apple's 1984 + Nike's 'You Can't Stop Us'"*).
   - **Per-locale variants**: AI suggests locale variants for the four CEE locales the workspace operates in; marketer reviews + edits.
2. Saves the arc, ready to use as context.

**Approximate time**: 10-15 minutes per arc.

### Flow 2 — Build an arc from a phrase (AI-drafted)

**Trigger**: marketer types a phrase in *Suggest arc from idea* — e.g., *"We're launching a Polish-only version aimed at Warsaw startups."*

1. AI proposes a complete arc draft (narrative, cast, channels, references) based on the phrase + brand profile.
2. Marketer reviews + refines.
3. Saves the arc.

**Approximate time**: 3-5 minutes if the AI's draft is close.

### Flow 3 — Generate copy that uses Arc X (existing copywriter, new input)

**Trigger**: marketer creates a new doc, picks an arc as context.

1. Copywriter agent loads the arc as additional context (alongside brand profile, voice).
2. Generation pulls from the arc:
   - Hooks echo the arc's hook.
   - Tone matches the arc's references (e.g., if "Apple 1984" is a reference, copy reads more cinematic / mythic).
   - Cast roles inform how the copy talks ABOUT the audience (hero), problem (villain), solution (mentor).
3. Marketer can toggle:
   - *Use arc strictly* — every paragraph hews to the spine.
   - *Use arc loosely* — arc as flavor, not skeleton.

### Flow 4 — Generate a full campaign sequence

**Trigger**: *Generate campaign* on an arc that has `campaign.channels` populated.

1. Campaign sequencer agent reads the arc's channels + timeline.
2. For each channel/week, generates the appropriate piece:
   - **Blog post** → long-form narrative.
   - **Email** → CTA-driven, references the blog post.
   - **Social** → punchy, references the email.
   - **Ad** → 1-2 sentences, references the social.
   - **Landing page** → narrative + conversion-optimized.
3. All pieces stored as **child docs** of the arc — marketer can edit each individually.
4. Coordinated across pieces: same hook variations, consistent cast voice, consistent CTAs.

**Approximate time**: 5-10 minutes for a 6-week campaign with 4 channels.

### Flow 5 — Generate a single long-form narrative piece

**Trigger**: *Generate long-form* on an arc.

1. AI produces a single long-form piece (~1500-3000 words) that walks through the full arc.
2. Useful for: founder stories, brand origin pieces, manifesto posts, anniversary content.

---

## Locale handling for storytelling

- Each arc has **per-locale variants** stored as siblings on the arc record.
- **AI-generated initial variants** — the AI knows Polish narrative traditions differ from Romanian, Ukrainian, English.
- Maintainer + native-speaker contributors refine over time.
- **Per-locale references**: a Polish ad campaign reference (e.g., the Allegro Christmas ads) is more resonant for Polish-locale arcs than a US reference.
- **Cultural touchpoints**: Polish humor, Romanian directness, Ukrainian historical resonance — encoded as locale-specific prompt addenda.

---

## Tech sketch

### New agents (in `src/lib/agents/`)
- **`story-arc-builder.ts`** — guided creation (Flow 1) + phrase-to-arc draft (Flow 2).
- **`campaign-sequencer.ts`** — turns an arc with channel/timeline into N coordinated child pieces (Flow 4).
- **`long-form-narrativist.ts`** — long-form piece generation (Flow 5).
- Existing **copywriter agent** gets new optional input: `arc_id` (Flow 3).

### New tables (Drizzle, in `src/db/schema.ts`)
- `story_arcs` — master arc records (with locale variants as nested JSONB).
- `arc_assets` — child docs created by campaign sequence (FK to `story_arcs`).
- `arc_references` — reference style anchors (could embed in the arc as JSONB, or break out for normalization + cross-arc reuse — open question).

### Integration with existing primitives
- **Brand profile** — cast defaults pull from `audiences` (hero) + `positioning.competitors` (villain) + the brand itself (mentor).
- **Copywriter** — adds optional arc context.
- **Localizer** — when localizing a piece, looks up the source piece's arc + uses the **target-locale variant** of the arc as context (not a translation of the source-locale variant — the variant is the source of truth for that locale).

---

## Per-locale references library

A library of reference style anchors per locale (AI-generated seed, community-refined):
- **en**: Apple 1984, Nike "Just Do It", Dollar Shave Club "Our Blades Are F***ing Great", Stripe docs voice.
- **pl**: Allegro Christmas campaigns, mBank "głupi smartfon" ads, IKEA Polish humor.
- **ro**: (AI-generated initial set, refined by community).
- **uk**: (AI-generated initial set, refined by community).

Marketers can also add their own references (specific to their industry or vibe).

---

## Open questions

1. **Inter-arc relationships** — can arcs reference each other? (*"Season 2 of our brand story continues season 1."*) Probably yes, as a `parent_arc_id` field. Out of initial scope.
2. **Arc visualization** — timeline / calendar view showing campaign weeks + channel mix? Nice-to-have, not blocking.
3. **Arc versioning** — arcs evolve mid-campaign. Snapshot history? Probably yes for the same reason brand profiles need it.
4. **Campaign sequence editing** — when the marketer edits one child doc (e.g., the blog post), should the others auto-update for consistency? Default no, but offer a *Regenerate dependents* button.
5. **Cross-channel references inside copy** — should the ad copy literally cite the blog post URL? Probably an arc-level setting.
6. **Long-form length** — target 1500? 3000? AI decides based on arc complexity? Probably AI-decides + marketer override.
7. **References data model** — embed in arc as JSONB (simpler) vs. break out into `arc_references` table (enables cross-arc reuse)?
8. **Cast as first-class** — should hero/villain/mentor be re-usable across arcs (a brand's villain rarely changes), or always per-arc? Probably per-arc with a "copy from brand profile defaults" affordance.

---

## Out of initial scope

- Performance feedback loop (*"did this campaign work?"*) — needs analytics first.
- Visual / video copy generation (text-only).
- Arc marketplaces / sharing across workspaces.
- A/B testing of arc variants.
- Auto-publishing to channels (OpenCopy generates copy; marketer publishes manually).
- Multi-language arc auto-localization at scale (use existing localizer for now; per-locale variants captured manually for the most important arcs).
- Inter-arc relationships (`parent_arc_id`) — deferred.
- Timeline / calendar visualization — deferred.
