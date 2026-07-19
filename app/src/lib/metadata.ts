import {
  costSchema,
  editRequestSchema,
  generateRequestSchema,
  IMAGE_MODELS,
  usageSchema,
} from '@image-gen/shared'
import { z } from 'zod'
import { recipeSchema } from './imaging/recipe'

// Reuse the gateway contract's own field schemas (quality/background/output_format/moderation)
// instead of re-declaring parallel enums here — keeps a re-run's reconstructed request in sync
// with the contract by construction, no manual `as` casts at the call site.
export const generationParamsSchema = z.object({
  size: z.string(),
  // quality/background mirror the gateway RESPONSE (a plain resolved string, contract.ts keeps
  // these loose since routing may resolve them beyond the request-time enum) — not the request enum.
  quality: z.string(),
  background: z.string(),
  output_format: generateRequestSchema.shape.output_format,
  output_compression: generateRequestSchema.shape.output_compression,
  n: generateRequestSchema.shape.n,
  moderation: generateRequestSchema.shape.moderation,
  // Edit-only — only meaningful for models where MODEL_CAPABILITIES.inputFidelity is true.
  input_fidelity: editRequestSchema.shape.input_fidelity,
})
export type GenerationParams = z.infer<typeof generationParamsSchema>

export const generationImageMetaSchema = z.object({
  filename: z.string(),
  format: z.enum(['png', 'webp', 'jpeg']),
})
export type GenerationImageMeta = z.infer<typeof generationImageMetaSchema>

/**
 * One baked PNG written by the Refine workbench to `<id>/derived/<path>.png` (e.g.
 * `favicon-32.png`, or `<name>.iconset/icon_16x16.png` for the macOS iconset preset — `filename`
 * is relative to the generation's `derived/` directory and may contain a subfolder).
 *
 * `listGenerations()` silently skips sidecars that fail `safeParse` — every field here must stay
 * optional-or-defaulted so a pre-Refine sidecar with no `derivatives` key keeps parsing rather
 * than vanishing from the library. See `metadata.test.ts` for the pinned regression.
 */
export const generationDerivativeSchema = z.object({
  filename: z.string(),
  /** Human label, e.g. "macOS iconset", "Favicon 32". */
  label: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string(),
  /** The Refine recipe that produced this derivative, so "Refine again" can reopen the workbench
   * seeded with it. Optional — derivatives exported before this field existed have none. */
  recipe: recipeSchema.optional(),
})
export type GenerationDerivative = z.infer<typeof generationDerivativeSchema>

/** Sidecar written alongside every generation's images at `~/Pictures/ImageGen/<id>/metadata.json`. */
export const generationMetadataSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  // Defaults to "generate" so sidecars written before this field existed still parse —
  // listGenerations() silently skips invalid sidecars, so a breaking change here would
  // hide entries from the user's library rather than error loudly.
  kind: z.enum(['generate', 'edit']).default('generate'),
  prompt: z.string(),
  requested_model: z.enum([...IMAGE_MODELS, 'auto'] as const),
  model: z.enum(IMAGE_MODELS),
  routed: z.boolean(),
  routing_reason: z.string().optional(),
  params: generationParamsSchema,
  images: z.array(generationImageMetaSchema),
  /** Input images saved alongside an edit (`input-1.<ext>`, `input-2.<ext>`, …). */
  input_images: z.array(generationImageMetaSchema).optional(),
  /** Mask saved alongside an edit (`mask.png`), when one was supplied. */
  mask: generationImageMetaSchema.optional(),
  /** Baked exports written by the Refine workbench (macOS iconset, favicon set, single PNG, …).
   * Optional so sidecars written before Refine existed keep parsing. */
  derivatives: z.array(generationDerivativeSchema).optional(),
  usage: usageSchema,
  cost: costSchema,
  latency_ms: z.number(),
  /** Id of the generation this one was re-run/tweaked from, for lineage. */
  parent_id: z.string().optional(),
  gateway_version: z.string().optional(),
})
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>
