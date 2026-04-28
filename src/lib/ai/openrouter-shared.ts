import { z } from "zod";

const PricingSchema = z
  .object({
    prompt: z.string().optional(),
    completion: z.string().optional(),
    request: z.string().optional(),
    image: z.string().optional(),
  })
  .partial()
  .optional();

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().optional(),
  pricing: PricingSchema,
  top_provider: z
    .object({
      max_completion_tokens: z.number().nullable().optional(),
      is_moderated: z.boolean().optional(),
    })
    .partial()
    .optional(),
  architecture: z
    .object({
      modality: z.string().optional(),
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
    })
    .partial()
    .optional(),
});

export type OpenRouterModel = z.infer<typeof ModelSchema>;

export const ListModelsResponseSchema = z.object({
  data: z.array(ModelSchema),
});

/** Friendly display name from id (vendor namespace removed if there's a name). */
export function modelDisplayName(m: Pick<OpenRouterModel, "id" | "name">): string {
  return m.name && m.name.length > 0 ? m.name : m.id;
}

/** Format pricing for the UI. */
export function modelPricingLabel(m: OpenRouterModel): string | null {
  const p = m.pricing;
  if (!p?.prompt && !p?.completion) return null;
  const promptUsd = p.prompt ? Number(p.prompt) * 1_000_000 : null;
  const completionUsd = p.completion ? Number(p.completion) * 1_000_000 : null;
  if (promptUsd != null && completionUsd != null) {
    return `$${promptUsd.toFixed(2)} / $${completionUsd.toFixed(2)} per 1M tok`;
  }
  if (promptUsd != null) return `$${promptUsd.toFixed(2)} prompt / 1M`;
  return null;
}

/** Recommended starter models for each role. Used as suggestions in settings. */
export const SUGGESTED_DEFAULTS: Record<string, string> = {
  planning: "anthropic/claude-sonnet-4.6",
  drafting: "anthropic/claude-sonnet-4.6",
  fast: "anthropic/claude-haiku-4.5",
  critic: "anthropic/claude-sonnet-4.6",
};
