/**
 * Default channel definitions seeded on workspace creation.
 *
 * Each entry maps to a `channel_definition` row and tells the drafter what
 * named fields to produce per channel. IDs of the components are STABLE —
 * changing them later orphans existing assets that store content keyed by
 * those IDs in `campaign_asset.components`.
 *
 * Design notes:
 * - Component count kept low (2–6 per channel). Long lists hurt model
 *   compliance — the drafter has to produce every required field on every
 *   draft, and small models trip past 6 sections.
 * - `maxLength` mirrors what the platform allows or what real-world copy
 *   conventions assume (e.g. SMS 160 chars, push notifications ~150).
 * - `prompt` is reserved for users to override at the per-component level
 *   if they want very specific guidance ("Always start with a number").
 *   The defaults intentionally leave `prompt` undefined.
 */

import type { Channel, ChannelComponent } from "@/db/schema";

export interface DefaultChannelDefinition {
  channelId: Channel;
  label: string;
  components: ChannelComponent[];
}

export const DEFAULT_CHANNEL_DEFINITIONS: DefaultChannelDefinition[] = [
  {
    channelId: "email-marketing",
    label: "Email — marketing",
    components: [
      {
        id: "subject",
        label: "Subject",
        type: "short",
        required: true,
        maxLength: 80,
        hint: "Headline-shaped. Avoid clickbait. Aim for 50–60 chars.",
      },
      {
        id: "preheader",
        label: "Preheader",
        type: "short",
        required: false,
        maxLength: 110,
        hint: "Continuation of the subject; shows in inbox after subject.",
      },
      {
        id: "body",
        label: "Body",
        type: "long",
        required: true,
        hint: "Multi-paragraph. Lead with the user's outcome.",
      },
      {
        id: "cta",
        label: "Primary CTA",
        type: "cta",
        required: true,
        maxLength: 40,
        hint: "Button copy. < 5 words. Action verb.",
      },
    ],
  },
  {
    channelId: "email-transactional",
    label: "Email — transactional",
    components: [
      {
        id: "subject",
        label: "Subject",
        type: "short",
        required: true,
        maxLength: 80,
        hint: "Functional. State what happened or what's needed.",
      },
      {
        id: "body",
        label: "Body",
        type: "long",
        required: true,
        hint: "Concise. Confirm the event + what to do next.",
      },
      {
        id: "cta",
        label: "CTA",
        type: "cta",
        required: false,
        maxLength: 40,
        hint: "Optional — only if there's a follow-up action.",
      },
    ],
  },
  {
    channelId: "ig-post",
    label: "Instagram — feed post",
    components: [
      {
        id: "caption",
        label: "Caption",
        type: "long",
        required: true,
        maxLength: 2200,
        hint: "Hook in line 1. Pay-off in the next 2–3 sentences.",
      },
      {
        id: "hashtags",
        label: "Hashtags",
        type: "short",
        required: false,
        maxLength: 200,
        hint: "5–10 mixed-popularity tags. Space-separated.",
      },
    ],
  },
  {
    channelId: "ig-story",
    label: "Instagram — story",
    components: [
      {
        id: "headline",
        label: "Headline overlay",
        type: "short",
        required: true,
        maxLength: 60,
        hint: "Big text on the story. < 8 words.",
      },
      {
        id: "subline",
        label: "Subline / context",
        type: "short",
        required: false,
        maxLength: 90,
        hint: "Smaller text under the headline.",
      },
      {
        id: "cta",
        label: "Sticker CTA",
        type: "cta",
        required: false,
        maxLength: 24,
        hint: "Swipe-up / link sticker label.",
      },
    ],
  },
  {
    channelId: "fb-ad",
    label: "Facebook ad",
    components: [
      {
        id: "headline",
        label: "Headline",
        type: "short",
        required: true,
        maxLength: 40,
        hint: "Top of the ad. Sharpest hook.",
      },
      {
        id: "primary_text",
        label: "Primary text",
        type: "long",
        required: true,
        maxLength: 280,
        hint: "Above the image. Lead with the outcome.",
      },
      {
        id: "description",
        label: "Description",
        type: "short",
        required: false,
        maxLength: 60,
        hint: "Below headline. Reinforces the offer.",
      },
      {
        id: "cta",
        label: "CTA",
        type: "cta",
        required: true,
        maxLength: 24,
        hint: "Button label. Pick from FB's allowed set.",
      },
    ],
  },
  {
    channelId: "blog",
    label: "Blog post",
    components: [
      {
        id: "title",
        label: "Title",
        type: "short",
        required: true,
        maxLength: 100,
        hint: "Searchable. State the value.",
      },
      {
        id: "deck",
        label: "Deck (subtitle)",
        type: "short",
        required: false,
        maxLength: 200,
        hint: "1-sentence summary under the title.",
      },
      {
        id: "body",
        label: "Body",
        type: "long",
        required: true,
        hint: "Full post — sections optional.",
      },
    ],
  },
  {
    channelId: "landing-hero",
    label: "Landing — hero",
    components: [
      {
        id: "headline",
        label: "Headline",
        type: "short",
        required: true,
        maxLength: 80,
        hint: "Above-the-fold value prop.",
      },
      {
        id: "subheadline",
        label: "Subheadline",
        type: "short",
        required: false,
        maxLength: 200,
        hint: "Expand the value prop in 1–2 sentences.",
      },
      {
        id: "cta_primary",
        label: "Primary CTA",
        type: "cta",
        required: true,
        maxLength: 24,
        hint: "Highest-intent button.",
      },
      {
        id: "cta_secondary",
        label: "Secondary CTA",
        type: "cta",
        required: false,
        maxLength: 24,
        hint: "Lower commitment — 'Learn more', 'See pricing'.",
      },
    ],
  },
  {
    channelId: "sms",
    label: "SMS",
    components: [
      {
        id: "body",
        label: "Body",
        type: "long",
        required: true,
        maxLength: 160,
        hint: "1 SMS = 160 chars. Lead with what's actionable.",
      },
    ],
  },
  {
    channelId: "push",
    label: "Push notification",
    components: [
      {
        id: "title",
        label: "Title",
        type: "short",
        required: true,
        maxLength: 50,
        hint: "What gets bolded on the lock screen.",
      },
      {
        id: "body",
        label: "Body",
        type: "long",
        required: true,
        maxLength: 150,
        hint: "1–2 lines. Tells them what to do.",
      },
    ],
  },
];
