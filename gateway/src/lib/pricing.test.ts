import { describe, expect, test } from 'bun:test'
import { computeCost } from './pricing.js'
import type { Usage } from '@image-gen/shared'

describe('computeCost', () => {
  test('uses input_tokens_details text/image split when present', () => {
    const usage: Usage = {
      input_tokens: 1000,
      output_tokens: 2000,
      total_tokens: 3000,
      input_tokens_details: { text_tokens: 600, image_tokens: 400 },
    }
    const cost = computeCost('gpt-image-2', usage)
    // (600/1e6 * 5.00) + (400/1e6 * 8.00) + (2000/1e6 * 30.00)
    const expected = (600 / 1_000_000) * 5.0 + (400 / 1_000_000) * 8.0 + (2000 / 1_000_000) * 30.0
    expect(cost.source).toBe('computed')
    expect(cost.usd).toBeCloseTo(expected, 10)
  })

  test('falls back to treating all input as text when details are missing', () => {
    const usage: Usage = { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 }
    const cost = computeCost('gpt-image-1-mini', usage)
    const expected = (1000 / 1_000_000) * 2.0 + (500 / 1_000_000) * 8.0
    expect(cost.source).toBe('computed')
    expect(cost.usd).toBeCloseTo(expected, 10)
  })

  test('gpt-image-1.5 uses its own output rate', () => {
    const usage: Usage = { input_tokens: 0, output_tokens: 1_000_000, total_tokens: 1_000_000 }
    const cost = computeCost('gpt-image-1.5', usage)
    expect(cost.usd).toBeCloseTo(32.0, 10)
  })

  test('unknown model returns no cost', () => {
    const usage: Usage = { input_tokens: 100, output_tokens: 100, total_tokens: 200 }
    expect(computeCost('not-a-real-model', usage)).toEqual({ usd: null, source: 'none' })
  })
})
