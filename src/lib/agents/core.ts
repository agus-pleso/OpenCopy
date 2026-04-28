import "server-only";
import { generateObject } from "ai";
import { z } from "zod";

import { resolveModel } from "@/lib/ai/providers";
import type { ModelRole } from "@/db/schema";

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

  const system =
    typeof def.systemPrompt === "function"
      ? def.systemPrompt(input)
      : def.systemPrompt;

  try {
    const result = await generateObject({
      model,
      schema: def.outputSchema,
      system,
      prompt: def.buildPrompt(input),
      temperature: def.temperature ?? 0.7,
      maxTokens: def.maxTokens,
    });

    const durationMs = Date.now() - start;
    ctx.onEvent?.({
      type: "finished",
      agent: def.name,
      modelId,
      durationMs,
      usage: {
        inputTokens: result.usage?.promptTokens,
        outputTokens: result.usage?.completionTokens,
      },
    });

    return { output: result.object, modelId, provider, durationMs };
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
