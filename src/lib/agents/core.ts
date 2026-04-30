import "server-only";
import { generateObject, generateText, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { resolveModel } from "@/lib/ai/providers";
import type { ModelRole } from "@/db/schema";
import { repairJsonText, tryParseAndValidate } from "./json-repair";

/**
 * Agent core — the primitive every OpenCopy agent is built on.
 *
 * Design principle: keep this thin. No framework dependency, no graph DSL.
 * Multi-agent flows (V1.0 Copywriter, Localizer) compose plain async-TS
 * pipelines on top of `runAgent` — that keeps OpenRouter ↔ direct ↔ Ollama
 * swaps trivial and side-steps the entire LangGraph/Mastra/CrewAI surface.
 */

export interface AgentContext {
  workspaceId: string;
  userId: string;
  /** Telemetry hook — used by the live agent timeline UI in V1.0. */
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | {
      type: "started";
      agent: string;
      modelId: string;
      provider: string;
      at: number;
    }
  | {
      type: "finished";
      agent: string;
      modelId: string;
      durationMs: number;
      usage?: { inputTokens?: number; outputTokens?: number };
    }
  | { type: "error"; agent: string; message: string };

export interface AgentDef<TInput, TOutput> {
  /** Stable identifier — appears in the timeline and telemetry. */
  name: string;
  /** Human-friendly description for the timeline UI. */
  description: string;
  /** Which workspace model role to route through. */
  modelRole: ModelRole;
  /** May be a static string or computed from the input (e.g. injecting the brand voice card). */
  systemPrompt: string | ((input: TInput) => string);
  /** Build the user-facing prompt body from the input. */
  buildPrompt: (input: TInput) => string;
  /** Zod schema used by `generateObject` for structured output. */
  outputSchema: z.ZodType<TOutput>;
  temperature?: number;
  maxTokens?: number;
}

export function defineAgent<TInput, TOutput>(
  def: AgentDef<TInput, TOutput>,
): AgentDef<TInput, TOutput> {
  return def;
}

export interface AgentRunResult<TOutput> {
  output: TOutput;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/** Run a single agent end-to-end. Returns the parsed structured output. */
export async function runAgent<TInput, TOutput>(
  def: AgentDef<TInput, TOutput>,
  input: TInput,
  ctx: AgentContext,
): Promise<AgentRunResult<TOutput>> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: def.modelRole,
  });

  ctx.onEvent?.({
    type: "started",
    agent: def.name,
    modelId,
    provider,
    at: start,
  });

  const baseSystem =
    typeof def.systemPrompt === "function"
      ? def.systemPrompt(input)
      : def.systemPrompt;
  const system = `${baseSystem}\n\nReturn ONLY a single JSON object that conforms to the requested schema. No markdown fences, no prose before or after the JSON.`;
  const userPrompt = def.buildPrompt(input);

  try {
    const result = await generateObject({
      model,
      schema: def.outputSchema,
      system,
      prompt: userPrompt,
      temperature: def.temperature ?? 0.7,
      maxTokens: def.maxTokens,
      mode: "json",
      experimental_repairText: async ({ text }) => repairJsonText(text),
    });

    const durationMs = Date.now() - start;
    const usage = {
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
    };
    ctx.onEvent?.({
      type: "finished",
      agent: def.name,
      modelId,
      durationMs,
      usage,
    });

    return { output: result.object, modelId, provider, durationMs, usage };
  } catch (err) {
    // Last-ditch fallback: ask the model again with `generateText`, repair the
    // raw output, and validate manually with Zod's safeParse. This rescues the
    // common case where a smaller model returns *almost* valid JSON.
    if (NoObjectGeneratedError.isInstance(err)) {
      console.warn(
        `[agent:${def.name}] structured generation failed, attempting text fallback. raw=`,
        err.text?.slice(0, 500),
      );
      try {
        const recovered = await rescueViaTextFallback(
          def,
          system,
          userPrompt,
          model,
          err.text,
        );
        const durationMs = Date.now() - start;
        ctx.onEvent?.({
          type: "finished",
          agent: def.name,
          modelId,
          durationMs,
          usage: undefined,
        });
        return {
          output: recovered,
          modelId,
          provider,
          durationMs,
          usage: undefined,
        };
      } catch (fallbackErr) {
        const message = (fallbackErr as Error).message;
        ctx.onEvent?.({ type: "error", agent: def.name, message });
        throw fallbackErr;
      }
    }
    const message = (err as Error).message;
    ctx.onEvent?.({ type: "error", agent: def.name, message });
    throw err;
  }
}

async function rescueViaTextFallback<TInput, TOutput>(
  def: AgentDef<TInput, TOutput>,
  system: string,
  userPrompt: string,
  model: Parameters<typeof generateObject>[0]["model"],
  prevText: string | undefined,
): Promise<TOutput> {
  // First, try parsing what we already got — `generateObject` may have
  // surfaced an error mid-validation while the text itself is recoverable.
  if (prevText) {
    const parsed = tryParseAndValidate(def.outputSchema, prevText);
    if (parsed.ok) return parsed.value;
  }

  // Re-issue as plain text with an even more explicit system prompt.
  const stricterSystem = `${system}

CRITICAL: Output ONLY valid JSON. No \`\`\` fences. No commentary. The output must parse with JSON.parse() on the first try.`;
  const result = await generateText({
    model,
    system: stricterSystem,
    prompt: userPrompt,
    temperature: 0.2,
    maxTokens: def.maxTokens,
  });

  const parsed = tryParseAndValidate(def.outputSchema, result.text);
  if (parsed.ok) return parsed.value;

  throw new Error(
    `Model output didn't match the ${def.name} schema even after a text retry. ` +
      `First validation issue: ${parsed.issue}`,
  );
}


/* ----------------------------------------------------------------------------
 * Text agents — for surfaces that need PROSE output (editor commands).
 * Uses generateText (no JSON wrapping). The model returns plain text which
 * gets pasted back into the document.
 * -------------------------------------------------------------------------- */

export interface TextAgentDef<TInput> {
  name: string;
  description: string;
  modelRole: ModelRole;
  systemPrompt: string | ((input: TInput) => string);
  buildPrompt: (input: TInput) => string;
  temperature?: number;
  maxTokens?: number;
}

export function defineTextAgent<TInput>(
  def: TextAgentDef<TInput>,
): TextAgentDef<TInput> {
  return def;
}

export interface TextAgentRunResult {
  text: string;
  modelId: string;
  provider: string;
  durationMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export async function runTextAgent<TInput>(
  def: TextAgentDef<TInput>,
  input: TInput,
  ctx: AgentContext,
): Promise<TextAgentRunResult> {
  const start = Date.now();
  const { model, modelId, provider } = await resolveModel({
    workspaceId: ctx.workspaceId,
    role: def.modelRole,
  });

  ctx.onEvent?.({
    type: "started",
    agent: def.name,
    modelId,
    provider,
    at: start,
  });

  const system =
    typeof def.systemPrompt === "function"
      ? def.systemPrompt(input)
      : def.systemPrompt;

  try {
    const result = await generateText({
      model,
      system,
      prompt: def.buildPrompt(input),
      temperature: def.temperature ?? 0.7,
      maxTokens: def.maxTokens,
    });

    const durationMs = Date.now() - start;
    const usage = {
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
    };
    ctx.onEvent?.({
      type: "finished",
      agent: def.name,
      modelId,
      durationMs,
      usage,
    });

    return {
      text: result.text.trim(),
      modelId,
      provider,
      durationMs,
      usage,
    };
  } catch (err) {
    const message = (err as Error).message;
    ctx.onEvent?.({ type: "error", agent: def.name, message });
    throw err;
  }
}

/** Format a structured rule list for prompt injection. */
export function formatRuleList(
  items: Array<{ rule: string; why?: string }>,
): string {
  if (items.length === 0) return "(none specified)";
  return items
    .map((it, i) => `${i + 1}. ${it.rule}${it.why ? ` — ${it.why}` : ""}`)
    .join("\n");
}

/** Format a string array for prompt injection. */
export function formatList(items: string[]): string {
  if (items.length === 0) return "(none)";
  return items.map((s) => `- ${s}`).join("\n");
}
