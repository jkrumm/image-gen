import type { Cost, ImageModel, Usage } from '@image-gen/shared'

interface Rate {
  text_in: number
  image_in: number
  out: number
}

// USD per 1M tokens (OpenAI direct pricing, see docs/research/image-api.md).
const RATES: Record<ImageModel, Rate> = {
  'gpt-image-2': { text_in: 5.0, image_in: 8.0, out: 30.0 },
  'gpt-image-1.5': { text_in: 5.0, image_in: 8.0, out: 32.0 },
  'gpt-image-1-mini': { text_in: 2.0, image_in: 2.5, out: 8.0 },
}

/**
 * Price one generation's usage. Uses `input_tokens_details` (text/image split)
 * when present; otherwise treats the whole input as text tokens. Unknown
 * models return `{ usd: null, source: 'none' }`.
 */
export function computeCost(model: string, usage: Usage): Cost {
  const rate = (RATES as Record<string, Rate | undefined>)[model]
  if (!rate) return { usd: null, source: 'none' }

  const details = usage.input_tokens_details
  const textTokens = details?.text_tokens ?? usage.input_tokens
  const imageTokens = details?.image_tokens ?? 0

  const inputCost =
    (textTokens / 1_000_000) * rate.text_in + (imageTokens / 1_000_000) * rate.image_in
  const outputCost = (usage.output_tokens / 1_000_000) * rate.out

  return { usd: inputCost + outputCost, source: 'computed' }
}
