import type { ImageModel } from './contract.js'

/**
 * USD per 1M output tokens per model. Mirrors `gateway/src/lib/pricing.ts`'s
 * `RATES[model].out` (OpenAI-direct pricing) — the two must never disagree.
 * Duplicated here rather than imported because `pricing.ts` prices a live
 * `usage` response (including the input side); this module estimates a cost
 * *before* a run exists, from the measured anchors below.
 */
const OUTPUT_RATE_PER_MILLION_TOKENS: Record<ImageModel, number> = {
  'gpt-image-2': 30.0,
  'gpt-image-1.5': 32.0,
  'gpt-image-1-mini': 8.0,
}

const BASE_PIXELS = 1024 * 1024

/**
 * Output-token anchors measured at 1024x1024 on gpt-image-2 (CLAUDE.md "Cost
 * shape"). No anchor was measured for `medium` — interpolated as the
 * geometric mean of low/high (flagged as an assumption in the G1 report).
 */
const OUTPUT_TOKENS_AT_BASE_SIZE: Record<'low' | 'medium' | 'high', number> = {
  low: 196,
  medium: Math.round(Math.sqrt(196 * 7024)),
  high: 7024,
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
  model: ImageModel
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
 * Estimates image-generation cost before a run, from the measured anchors —
 * see the "Cost shape" table in CLAUDE.md and `shared/playbook/settings.md`.
 * Scales output tokens linearly with pixel count relative to the 1024x1024
 * anchor.
 */
export function estimateCost(input: EstimateCostInput): EstimatedCost {
  const quality = input.quality === 'auto' ? 'high' : input.quality
  const pixelScale = sizeToPixels(input.size) / BASE_PIXELS
  const outputTokens =
    OUTPUT_TOKENS_AT_BASE_SIZE[quality] * pixelScale +
    (input.streaming ? STREAMING_OVERHEAD_TOKENS : 0)
  const perImageUsd = (outputTokens / 1_000_000) * OUTPUT_RATE_PER_MILLION_TOKENS[input.model]
  return { per_image_usd: perImageUsd, total_usd: perImageUsd * input.n }
}
