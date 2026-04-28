import "server-only";
import { ListModelsResponseSchema, type OpenRouterModel } from "./openrouter-shared";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Verify a key by hitting OpenRouter's auth/key endpoint. */
export async function verifyOpenRouterKey(apiKey: string): Promise<{
  ok: boolean;
  label?: string;
  message?: string;
}> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, message: text.slice(0, 200) || `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { data?: { label?: string } };
    return { ok: true, label: json.data?.label };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Lists available models. Sorted by name; large list (~300 entries). */
export async function listOpenRouterModels(
  apiKey?: string,
): Promise<OpenRouterModel[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /models failed: ${res.status}`);
  }
  const raw = await res.json();
  const parsed = ListModelsResponseSchema.parse(raw);
  return parsed.data.sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id),
  );
}
