import type { Step } from "react-joyride";
import type { TourId } from "@/server/actions/tours";

export interface TourDefinition {
  id: TourId;
  label: string;
  description: string;
  steps: Step[];
  /** Path the user must be on for this tour to fire (or a prefix). For
   *  the first-run tour we accept any path. */
  scope?: string;
}

const NEXT_LOCALE_BUTTONS = {
  showProgress: true,
  showSkipButton: true,
} as const;

/**
 * Helper: a step rendered as a centered modal — useful for welcome/closing
 * cards that don't need to point at a specific element.
 */
const center = (
  title: string,
  body: string | React.ReactNode,
): Step => ({
  target: "body",
  placement: "center",
  content: (
    <div className="flex flex-col gap-2 text-left">
      <p className="font-display text-lg tracking-tight">{title}</p>
      <div className="text-sm text-[var(--color-muted-foreground)]">{body}</div>
    </div>
  ),
});

const point = (
  selector: string,
  title: string,
  body: string | React.ReactNode,
  placement: Step["placement"] = "right",
): Step => ({
  target: selector,
  placement,
  content: (
    <div className="flex flex-col gap-2 text-left">
      <p className="font-medium tracking-tight">{title}</p>
      <div className="text-sm text-[var(--color-muted-foreground)]">{body}</div>
    </div>
  ),
});

export const FIRST_RUN: TourDefinition = {
  id: "first_run",
  label: "Welcome tour",
  description:
    "Two-minute walkthrough of every surface in OpenCopy — the rails, the four creation tools, and the canonical archive.",
  steps: [
    center(
      "Welcome to OpenCopy",
      "Two minutes to get oriented. Skip anytime — you can replay this from the user menu.",
    ),
    point(
      '[data-tour="nav-/voices"]',
      "Brand voices",
      "Paste a few writing samples and OpenCopy builds a structured voice profile. Every agent reads from it.",
    ),
    point(
      '[data-tour="nav-/knowledge"]',
      "Knowledge",
      "Upload sources you want the agents to ground their answers in. pgvector handles retrieval automatically.",
    ),
    point(
      '[data-tour="nav-/campaigns"]',
      "Campaigns",
      "One brief produces a coordinated bundle — blog, social, ad, email, landing — with per-channel angles.",
    ),
    point(
      '[data-tour="nav-/library"]',
      "Library",
      "The canonical archive of variants you've saved. Filter, batch select, export anywhere.",
    ),
    point(
      '[data-tour="nav-/agents/copywriter"]',
      "Copywriter",
      "Plan → draft → audit → refine. Run on a brief, get on-brand variants with their critique trail.",
    ),
    point(
      '[data-tour="nav-/agents/localizer"]',
      "Localizer",
      "Cultural adapter + transcreator + back-translator. Produces translations that don't read as translations.",
    ),
    point(
      '[data-tour="nav-/documents"]',
      "Long-form",
      "Tiptap editor with /compose, /continue, /rephrase, /expand slash commands. Voice-grounded inline AI.",
    ),
    point(
      '[data-tour="nav-/chat"]',
      "Chat",
      "Threaded, voice-grounded, KB-grounded. Streaming. For when a quick question is faster than a full agent run.",
    ),
    point(
      '[data-tour="nav-/settings"]',
      "Settings → AI Providers",
      "Paste your OpenRouter key first (or any direct provider). Without it, agents have no model to call.",
      "right-end",
    ),
    center(
      "You're set",
      "Click any sidebar entry to start. Replay this anytime from the user menu in the top-right.",
    ),
  ],
};

export const VOICES: TourDefinition = {
  id: "voices",
  label: "Brand voices",
  description: "How to build a voice profile from samples.",
  scope: "/voices",
  steps: [
    point(
      '[data-tour="voices-new"]',
      "Add a voice",
      "Click here to start. Pick a name and paste 3–5 representative samples — the more, the more accurate.",
    ),
    point(
      '[data-tour="voices-list"]',
      "Voice list",
      "Each card shows the analysis status. Click into a voice to inspect tone, do's, don'ts, and the audit playground.",
    ),
  ],
};

export const KNOWLEDGE: TourDefinition = {
  id: "knowledge",
  label: "Knowledge base",
  description: "Hook factual sources into every agent run.",
  scope: "/knowledge",
  steps: [
    point(
      '[data-tour="kb-new"]',
      "Add a source",
      "Paste text, link a URL, or import. We'll chunk it and embed it so agents can retrieve passages by similarity.",
    ),
    point(
      '[data-tour="kb-list"]',
      "Sources",
      "Each source shows chunk count + status. Attach sources to a Compose surface and the agent will retrieve from them.",
    ),
  ],
};

export const CAMPAIGNS: TourDefinition = {
  id: "campaigns",
  label: "Campaigns",
  description: "Multi-asset orchestration from one brief.",
  scope: "/campaigns",
  steps: [
    point(
      '[data-tour="campaigns-new"]',
      "New campaign",
      "Describe the launch + objective. The orchestrator drafts assets across the channels you pick.",
    ),
    point(
      '[data-tour="campaigns-list"]',
      "Campaign list",
      "Click in for the strategy panel + per-channel asset browser. Each asset is a separate agent run.",
    ),
  ],
};

export const LIBRARY: TourDefinition = {
  id: "library",
  label: "Library",
  description: "Where approved output lives.",
  scope: "/library",
  steps: [
    point(
      '[data-tour="library-list"]',
      "Saved variants",
      "Anything you saved from a Copywriter / Localizer / Chat / Document. The canonical archive.",
    ),
    point(
      '[data-tour="library-filters"]',
      "Filter chips",
      "Slice by source surface, voice, locale, or date range to find a specific variant.",
      "bottom",
    ),
  ],
};

export const DOCUMENTS: TourDefinition = {
  id: "documents",
  label: "Long-form editor",
  description: "Tiptap editor with inline AI.",
  scope: "/documents",
  steps: [
    point(
      '[data-tour="documents-new"]',
      "New document",
      "Start blank or from a template. Editor uses Tiptap — the slash commands run agents inline.",
    ),
    point(
      '[data-tour="documents-list"]',
      "Document list",
      "Auto-saved as you type. Open one to access /compose, /continue, /rephrase, /expand, /change-tone.",
    ),
  ],
};

export const CHAT: TourDefinition = {
  id: "chat",
  label: "Chat",
  description: "Threaded conversations grounded in your voice.",
  scope: "/chat",
  steps: [
    point(
      '[data-tour="chat-new"]',
      "New thread",
      "Pick a voice + optional knowledge sources. The thread stays grounded as you iterate.",
    ),
    point(
      '[data-tour="chat-list"]',
      "Threads",
      "Persistent — each thread keeps its voice/KB attachments. Save any message to the Library with one click.",
    ),
  ],
};

export const COPYWRITER: TourDefinition = {
  id: "agents",
  label: "Copywriter",
  description: "Multi-step copywriting agent with auditor.",
  scope: "/agents/copywriter",
  steps: [
    point(
      '[data-tour="copywriter-form"]',
      "Run a brief",
      "Pick a voice, describe the task, optionally attach knowledge sources. Hit run.",
    ),
    point(
      '[data-tour="copywriter-list"]',
      "Recent runs",
      "Each run produces parallel drafts → auditor critique → refined variants. Save the keepers to Library.",
    ),
  ],
};

export const ALL_TOURS: TourDefinition[] = [
  FIRST_RUN,
  VOICES,
  KNOWLEDGE,
  CAMPAIGNS,
  LIBRARY,
  DOCUMENTS,
  CHAT,
  COPYWRITER,
];

export const TOUR_BY_ID: Record<TourId, TourDefinition> = Object.fromEntries(
  ALL_TOURS.map((t) => [t.id, t]),
) as Record<TourId, TourDefinition>;

export { NEXT_LOCALE_BUTTONS };
