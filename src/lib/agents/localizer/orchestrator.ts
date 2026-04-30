import "server-only";
import { type AgentContext } from "../core";
import { runVoiceAuditor, type VoiceAudit } from "../voice-auditor";
import type { VoiceCardForPrompt, Locale } from "../voice-card";
import { runCulturalAdapter, type CulturalAdapterOutput } from "./cultural-adapter";
import { runLocalizerTranscreator, type LocalizerOutput } from "./localizer";
import { runBackTranslator, type BackTranslatorOutput } from "./back-translator";

export interface LocalizerOrchestratorInput {
  voice?: VoiceCardForPrompt & { id: string };
  sourceText: string;
  sourceLocale: Locale;
  targetLocale: Locale;
  contextHint?: string;
}

export interface LocalizerRunResult {
  adapter: CulturalAdapterOutput;
  target: LocalizerOutput;
  backTranslation: BackTranslatorOutput;
  /** Optional — only present when a voice was supplied. */
  audit?: VoiceAudit;
  totalDurationMs: number;
  modelIds: {
    adapter: string;
    localizer: string;
    backTranslator: string;
    auditor?: string;
  };
}

/**
 * Orchestrates the localizer flow:
 *   1. Cultural Adapter — flags idioms / cultural references / formality
 *   2. Localizer — transcreates to target, honoring voice + adapter notes
 *   3. Back-Translator — sanity-check translation back to source
 *   4. Voice Auditor — only if a voice was supplied; validates target stays on-brand
 */
export async function runLocalizer(
  input: LocalizerOrchestratorInput,
  ctx: AgentContext,
): Promise<LocalizerRunResult> {
  const start = Date.now();
  const subCtx = { workspaceId: ctx.workspaceId, userId: ctx.userId };

  // Step 1 — cultural adapter
  const adapterResult = await runCulturalAdapter(
    {
      voice: input.voice,
      sourceText: input.sourceText,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      contextHint: input.contextHint,
    },
    subCtx,
  );

  // Step 2 — localizer (transcreate)
  const localizerResult = await runLocalizerTranscreator(
    {
      voice: input.voice,
      sourceText: input.sourceText,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      contextHint: input.contextHint,
      adapterNotes: adapterResult.output,
    },
    subCtx,
  );

  // Steps 3 + 4 — back-translation + audit can run in parallel.
  const targetText = localizerResult.output.target_text;
  const backPromise = runBackTranslator(
    {
      targetText,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      originalSource: input.sourceText,
    },
    subCtx,
  );

  const auditPromise = input.voice
    ? runVoiceAuditor(
        {
          voice: input.voice,
          draft: targetText,
          locale: input.targetLocale,
        },
        subCtx,
      )
    : null;

  const [backResult, auditResult] = await Promise.all([
    backPromise,
    auditPromise,
  ]);

  return {
    adapter: adapterResult.output,
    target: localizerResult.output,
    backTranslation: backResult.output,
    audit: auditResult?.output,
    totalDurationMs: Date.now() - start,
    modelIds: {
      adapter: adapterResult.modelId,
      localizer: localizerResult.modelId,
      backTranslator: backResult.modelId,
      auditor: auditResult?.modelId,
    },
  };
}
