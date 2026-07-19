import { z } from 'zod'
import { IMAGE_MODELS } from './contract.js'

/**
 * `POST /enhance` v2 contract — see docs/concept.md §7. Named `plan*` (not
 * `enhance*`) so it can't collide with the v1 `enhanceRequestSchema`/
 * `enhanceResponseSchema` in contract.ts, which the gateway still serves
 * until G2 swaps and deletes them.
 */

export const INTENTS = [
  'auto',
  'icon',
  'hero',
  'painterly',
  'technical',
  'diagram',
  'article',
  'figure-art',
  'texture',
] as const
export type Intent = (typeof INTENTS)[number]

export const PLAN_MODES = ['auto', 'full', 'gaps', 'off'] as const
export type PlanMode = (typeof PLAN_MODES)[number]

export const MAX_PROMPT_FRAGMENT_WORDS = 40

/**
 * A style-guide prompt fragment, capped at `MAX_PROMPT_FRAGMENT_WORDS` words
 * (docs/concept.md §3: "prompt_fragment (≤40 words)"). Shared between a plan
 * request's inline `style_guide` (below) and `sidecar.ts`'s persisted
 * `styleGuideSchema` so the constraint lives in exactly one place.
 */
export const promptFragmentSchema = z
  .string()
  .refine(
    (value) => value.trim().split(/\s+/).filter(Boolean).length <= MAX_PROMPT_FRAGMENT_WORDS,
    { message: `prompt_fragment must be ${MAX_PROMPT_FRAGMENT_WORDS} words or fewer` },
  )

/** User-pinned settings on a plan request — echoed verbatim, never derived over. */
export const planOverridesSchema = z.object({
  model: z.enum([...IMAGE_MODELS, 'auto'] as const).optional(),
  size: z.string().optional(),
  quality: z.enum(['low', 'medium', 'high', 'auto']).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  n: z.number().int().min(1).max(10).optional(),
  moderation: z.enum(['auto', 'low']).optional(),
  input_fidelity: z.enum(['high', 'low']).optional(),
  partial_images: z.number().int().min(0).max(3).optional(),
})
export type PlanOverrides = z.infer<typeof planOverridesSchema>

/**
 * Style-guide fields carried into a plan request — a snapshot the caller read
 * off a persisted style guide, not a live reference (see `sidecar.ts`'s
 * `styleGuideSchema` for the persisted shape this is copied from).
 */
export const planStyleGuideSchema = z.object({
  prompt_fragment: promptFragmentSchema,
  palette: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  ref_image_count: z.number().int().min(0).default(0),
})
export type PlanStyleGuide = z.infer<typeof planStyleGuideSchema>

/**
 * One project anchor's accepted prompt + the settings it ran with, for
 * series-consistency context (docs/concept.md §3). `settings` is a loose
 * record rather than `planSettingsSchema` below — anchors may predate fields
 * the current schema adds, and the enhancer only reads vocabulary out of the
 * prompt, not this bag, so over-constraining it buys nothing.
 */
export const seriesContextEntrySchema = z.object({
  prompt: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
})
export type SeriesContextEntry = z.infer<typeof seriesContextEntrySchema>

export const planRequestSchema = z
  .object({
    /** New plan from a short brief. Exactly one of `brief`/`current_prompt` is required. */
    brief: z.string().min(1).max(4_000).optional(),
    /** Iteration: the previously-accepted prompt to carry forward. */
    current_prompt: z.string().min(1).max(32_000).optional(),
    /** "What changes?" — only meaningful together with `current_prompt`. */
    delta: z.string().min(1).max(4_000).optional(),
    /** `off` = policy pre-check + settings only, no prose rewriting. */
    mode: z.enum(PLAN_MODES).default('auto'),
    intent: z.enum(INTENTS).default('auto'),
    overrides: planOverridesSchema.optional(),
    style_guide: planStyleGuideSchema.optional(),
    series_context: z.array(seriesContextEntrySchema).default([]),
    preserve_list: z.array(z.string()).default([]),
    has_references: z.boolean().default(false),
  })
  .superRefine((req, ctx) => {
    const hasBrief = req.brief !== undefined
    const hasCurrentPrompt = req.current_prompt !== undefined
    if (hasBrief === hasCurrentPrompt) {
      ctx.addIssue({
        code: 'custom',
        path: [hasBrief ? 'current_prompt' : 'brief'],
        message: 'exactly one of brief or current_prompt is required',
      })
    }
    if (req.delta !== undefined && !hasCurrentPrompt) {
      ctx.addIssue({
        code: 'custom',
        path: ['delta'],
        message: 'delta is only valid together with current_prompt',
      })
    }
  })
export type PlanRequest = z.infer<typeof planRequestSchema>
export type PlanRequestInput = z.input<typeof planRequestSchema>

export const planIntentResultSchema = z.object({
  detected: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
})
export type PlanIntentResult = z.infer<typeof planIntentResultSchema>

export const planAdditionSchema = z.object({
  slot: z.string(),
  text: z.string(),
})
export type PlanAddition = z.infer<typeof planAdditionSchema>

export const verbatimCheckSchema = z.object({
  ok: z.boolean(),
  missing: z.array(z.string()).default([]),
})
export type VerbatimCheck = z.infer<typeof verbatimCheckSchema>

/**
 * Settings a Plan derives. The LLM proposes; `rules.ts` disposes — the
 * gateway validates this against `MODEL_CAPABILITIES` before the response
 * leaves, per docs/concept.md §7.
 */
export const planSettingsSchema = z.object({
  endpoint: z.enum(['generate', 'edit']),
  model: z.enum(IMAGE_MODELS),
  size: z.string(),
  quality: z.enum(['low', 'medium', 'high', 'auto']),
  background: z.enum(['transparent', 'opaque', 'auto']),
  n: z.number().int().min(1).max(10),
  moderation: z.enum(['auto', 'low']),
  /** Edits-only; present only for models where MODEL_CAPABILITIES.inputFidelity is true. */
  input_fidelity: z.enum(['high', 'low']).optional(),
  partial_images: z.number().int().min(0).max(3),
})
export type PlanSettings = z.infer<typeof planSettingsSchema>

export const estimatedCostSchema = z.object({
  per_image_usd: z.number(),
  total_usd: z.number(),
})
export type PlanEstimatedCost = z.infer<typeof estimatedCostSchema>

export const PLAN_WARNING_SEVERITIES = ['warn', 'rewrite', 'hard'] as const
export type PlanWarningSeverity = (typeof PLAN_WARNING_SEVERITIES)[number]

export const planWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(PLAN_WARNING_SEVERITIES),
  message: z.string(),
  suggested_rewrite: z.string().optional(),
  moderation_suggestion: z.enum(['auto', 'low']).optional(),
  predicted_stage: z.enum(['input', 'output']).optional(),
})
export type PlanWarning = z.infer<typeof planWarningSchema>

export const planResponseSchema = z.object({
  intent: planIntentResultSchema,
  /** Medium-first canonical order + terminal constraint block — see shared/playbook/core.md. */
  prompt: z.string(),
  additions: z.array(planAdditionSchema).default([]),
  /** Server-side containment post-check: every concrete noun/quantity/color/name/quoted string in the brief survived into `prompt`. */
  verbatim_check: verbatimCheckSchema,
  assumptions: z.array(z.string()).default([]),
  settings: planSettingsSchema,
  estimated_cost: estimatedCostSchema,
  warnings: z.array(planWarningSchema).default([]),
  mode_applied: z.enum(PLAN_MODES),
  playbook_version: z.string(),
})
export type PlanResponse = z.infer<typeof planResponseSchema>
