import type { KnownImageModel } from './contract.js'

/**
 * USD per 1M output tokens per model. Mirrors `gateway/src/lib/pricing.ts`'s
 * `RATES[model].out` (OpenAI-direct pricing) — the two must never disagree.
 * Duplicated here rather than imported because `pricing.ts` prices a live
 * `usage` response (including the input side); this module estimates a cost
 * *before* a run exists, from the measured anchors below.
 *
 * Keyed by `KnownImageModel`, not `ImageModel`: historical generations on a
 * retired model still need a cost estimate/display in the library.
 */
const OUTPUT_RATE_PER_MILLION_TOKENS: Record<KnownImageModel, number> = {
  'gpt-image-2': 30.0,
  'gpt-image-1.5': 32.0,
  'gpt-image-1-mini': 8.0,
}

const BASE_PIXELS = 1024 * 1024

/**
 * Output-token anchors measured at 1024x1024, per model — token output is
 * per-model, not a shared constant, so each model gets its own anchor set.
 *
 * gpt-image-2: all three anchors measured directly (CLAUDE.md "Cost shape"
 * table is gpt-image-2-specific — do not apply it to other models). `medium`
 * has no direct measurement; interpolated as the geometric mean of low/high.
 *
 * gpt-image-1.5: `low` (429) is measured — 4 images, 1717 total output
 * tokens at 1024x1024. `medium`/`high` are EXTRAPOLATED by scaling the
 * gpt-image-2 anchors by the measured low-ratio (429/196 ≈ 2.19); no direct
 * measurement exists for either.
 *
 * gpt-image-1-mini: no measurements exist at all. Reuses the gpt-image-2
 * anchors as unmeasured placeholders.
 */
const GPT_IMAGE_2_ANCHORS = {
  low: 196,
  medium: Math.round(Math.sqrt(196 * 7024)),
  high: 7024,
}

const GPT_IMAGE_1_5_LOW_RATIO = 429 / 196

const OUTPUT_TOKENS_AT_BASE_SIZE: Record<
  KnownImageModel,
  Record<'low' | 'medium' | 'high', number>
> = {
  'gpt-image-2': GPT_IMAGE_2_ANCHORS,
  'gpt-image-1.5': {
    low: 429,
    medium: Math.round(GPT_IMAGE_2_ANCHORS.medium * GPT_IMAGE_1_5_LOW_RATIO),
    high: Math.round(GPT_IMAGE_2_ANCHORS.high * GPT_IMAGE_1_5_LOW_RATIO),
  },
  'gpt-image-1-mini': GPT_IMAGE_2_ANCHORS,
}

/** Flat streaming-preview overhead (measured), independent of size/quality/n. */
const STREAMING_OVERHEAD_TOKENS = 77

/**
 * Parses a `WxH` size string into a pixel count. `auto` and unparsable sizes
 * fall back to the 1024x1024 base the anchors were measured at.
 */
export function sizeToPixels(size: string): number {
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(size)
  if (!match) return BASE_PIXELS
  return Number(match[1]) * Number(match[2])
}

export interface EstimateCostInput {
  model: KnownImageModel
  /** `auto` is treated as `high` — estimate the expensive case rather than under-quote. */
  quality: 'low' | 'medium' | 'high' | 'auto'
  size: string
  streaming: boolean
  n: number
}

export interface EstimatedCost {
  per_image_usd: number
  total_usd: number
}

/**
 * Estimates image-generation cost before a run, from the per-model anchors
 * above — see the "Cost shape" table in CLAUDE.md (gpt-image-2 only) and
 * `shared/playbook/settings.md`. Scales output tokens linearly with pixel
 * count relative to the 1024x1024 anchor. Linear-in-pixels is an
 * approximation, not an exact law (a measured gpt-image-1.5 data point at
 * 1.5x base pixels came in above the linear prediction) — good enough for a
 * pre-run estimate, not a guarantee.
 */
export function estimateCost(input: EstimateCostInput): EstimatedCost {
  const quality = input.quality === 'auto' ? 'high' : input.quality
  const pixelScale = sizeToPixels(input.size) / BASE_PIXELS
  const outputTokens =
    OUTPUT_TOKENS_AT_BASE_SIZE[input.model][quality] * pixelScale +
    (input.streaming ? STREAMING_OVERHEAD_TOKENS : 0)
  const perImageUsd = (outputTokens / 1_000_000) * OUTPUT_RATE_PER_MILLION_TOKENS[input.model]
  return { per_image_usd: perImageUsd, total_usd: perImageUsd * input.n }
}
