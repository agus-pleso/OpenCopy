"use server";

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  agentRunSteps,
  agentRuns,
  chatMessages,
  type ApiKeyProvider,
} from "@/db/schema";
import { getCurrentWorkspace, requireRole } from "@/lib/auth/workspace";
import { listOpenRouterModels } from "@/lib/ai/openrouter";
import type { OpenRouterModel } from "@/lib/ai/openrouter-shared";
import { decryptSecret } from "@/lib/crypto";
import { apiKeys } from "@/db/schema";
import { estimateCost } from "@/lib/ai/model-pricing";

export interface UsageByModel {
  modelId: string;
  provider: ApiKeyProvider | "unknown";
  feature: string; // "copywriter" | "localizer" | "chat" | etc.
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageSummary {
  windowDays: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  /** Aggregated by (modelId, feature). */
  byModel: UsageByModel[];
  byFeature: Array<{
    feature: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
  /** Whether OpenRouter pricing was successfully loaded. */
  openRouterPricingLoaded: boolean;
}

const FEATURE_BY_AGENT_NAME: Record<string, string> = {
  "copywriter-planner": "copywriter",
  "copywriter-drafter": "copywriter",
  "copywriter-refiner": "copywriter",
  "voice-auditor": "voice-audit",
  "voice-analyzer": "voice-analyze",
  "localizer-cultural-adapter": "localizer",
  "localizer-transcreator": "localizer",
  "localizer-back-translator": "localizer",
};

function inferProviderFromModelId(modelId: string): ApiKeyProvider | "unknown" {
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
    return "openai";
  }
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("mistral-") || modelId.includes("mistral")) {
    return "mistral";
  }
  if (
    /^(llama|qwen|mistral|phi|gemma|deepseek|nomic)/.test(modelId.toLowerCase())
  ) {
    return "ollama";
  }
  return "unknown";
}

/** Build a quick lookup of OpenRouter pricing by id. */
async function loadOpenRouterPricing(
  workspaceId: string,
): Promise<{ map: Map<string, OpenRouterModel>; ok: boolean }> {
  const keyRow = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.workspaceId, workspaceId),
      eq(apiKeys.provider, "openrouter"),
      eq(apiKeys.isActive, true),
    ),
  });
  let apiKey: string | undefined;
  if (keyRow?.ciphertext) {
    try {
      apiKey = decryptSecret(keyRow.ciphertext);
    } catch {
      apiKey = undefined;
    }
  }
  try {
    const models = await listOpenRouterModels(apiKey);
    const map = new Map(models.map((m) => [m.id, m]));
    return { map, ok: true };
  } catch {
    return { map: new Map(), ok: false };
  }
}

interface RawRow {
  modelId: string | null;
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export async function getUsageSummary(opts?: {
  windowDays?: number;
}): Promise<UsageSummary> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "viewer");

  const windowDays = Math.min(Math.max(opts?.windowDays ?? 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Agent steps (copywriter / localizer / voice analyzer / auditor).
  const stepRows = await db
    .select({
      agentName: agentRunSteps.agentName,
      modelId: agentRunSteps.modelId,
      input: sql<number>`coalesce(sum(${agentRunSteps.inputTokens}), 0)`.mapWith(Number),
      output: sql<number>`coalesce(sum(${agentRunSteps.outputTokens}), 0)`.mapWith(Number),
      calls: sql<number>`count(*)`.mapWith(Number),
    })
    .from(agentRunSteps)
    .innerJoin(agentRuns, eq(agentRunSteps.runId, agentRuns.id))
    .where(
      and(
        eq(agentRuns.workspaceId, workspace.id),
        // Filter on the run's createdAt — agentRunSteps.startedAt is currently
        // not populated by any code path, and the previous `?? finishedAt`
        // fallback was a JS expression (column objects are always truthy), so
        // this had silently been filtering on a NULL column and excluding
        // every row.
        gte(agentRuns.createdAt, since),
        // Only count succeeded steps (failed don't bill).
        eq(agentRunSteps.status, "succeeded"),
      ),
    )
    .groupBy(agentRunSteps.agentName, agentRunSteps.modelId);

  // Chat messages (assistant only — that's where tokens are billed).
  const chatRows = await db
    .select({
      modelId: chatMessages.modelId,
      input: sql<number>`coalesce(sum(${chatMessages.inputTokens}), 0)`.mapWith(Number),
      output: sql<number>`coalesce(sum(${chatMessages.outputTokens}), 0)`.mapWith(Number),
      calls: sql<number>`count(*)`.mapWith(Number),
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspace.id),
        eq(chatMessages.role, "assistant"),
        gte(chatMessages.createdAt, since),
      ),
    )
    .groupBy(chatMessages.modelId);

  const raw: RawRow[] = [
    ...stepRows.map((r) => ({
      modelId: r.modelId,
      feature: FEATURE_BY_AGENT_NAME[r.agentName] ?? r.agentName,
      calls: r.calls,
      inputTokens: r.input,
      outputTokens: r.output,
    })),
    ...chatRows.map((r) => ({
      modelId: r.modelId,
      feature: "chat",
      calls: r.calls,
      inputTokens: r.input,
      outputTokens: r.output,
    })),
  ];

  // Load OpenRouter pricing once for cost estimation.
  const { map: orPricing, ok: openRouterPricingLoaded } = await loadOpenRouterPricing(
    workspace.id,
  );

  const byModel: UsageByModel[] = raw.map((r) => {
    const modelId = r.modelId ?? "(unknown)";
    const provider = inferProviderFromModelId(modelId);
    let costUsd = 0;
    if (provider === "openrouter") {
      const live = orPricing.get(modelId);
      if (live?.pricing) {
        costUsd = estimateCost("openrouter", modelId, r.inputTokens, r.outputTokens, {
          prompt: live.pricing.prompt ? Number(live.pricing.prompt) : null,
          completion: live.pricing.completion
            ? Number(live.pricing.completion)
            : null,
        });
      }
    } else if (provider !== "unknown") {
      costUsd = estimateCost(provider, modelId, r.inputTokens, r.outputTokens);
    }
    return {
      modelId,
      provider,
      feature: r.feature,
      calls: r.calls,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd,
    };
  });

  // Roll up by feature.
  const featureMap = new Map<string, UsageByModel>();
  byModel.forEach((m) => {
    const cur = featureMap.get(m.feature);
    if (!cur) {
      featureMap.set(m.feature, { ...m, modelId: "*", provider: "unknown" });
    } else {
      cur.calls += m.calls;
      cur.inputTokens += m.inputTokens;
      cur.outputTokens += m.outputTokens;
      cur.costUsd += m.costUsd;
    }
  });
  const byFeature = [...featureMap.values()]
    .map((f) => ({
      feature: f.feature,
      calls: f.calls,
      inputTokens: f.inputTokens,
      outputTokens: f.outputTokens,
      costUsd: f.costUsd,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  byModel.sort((a, b) => b.costUsd - a.costUsd);

  return {
    windowDays,
    totalCalls: byModel.reduce((acc, m) => acc + m.calls, 0),
    totalInputTokens: byModel.reduce((acc, m) => acc + m.inputTokens, 0),
    totalOutputTokens: byModel.reduce((acc, m) => acc + m.outputTokens, 0),
    totalCostUsd: byModel.reduce((acc, m) => acc + m.costUsd, 0),
    byModel,
    byFeature,
    openRouterPricingLoaded,
  };
}
