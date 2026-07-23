import { describe, expect, test } from 'bun:test'
import { estimateCost, sizeToPixels } from './cost.js'

describe('estimateCost', () => {
  test('quality low at 1024x1024 matches the measured anchor (~$0.006)', () => {
    const cost = estimateCost({
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    // 196 output tokens * $30.00 / 1M
    expect(cost.per_image_usd).toBeCloseTo(0.00588, 5)
    expect(cost.total_usd).toBeCloseTo(cost.per_image_usd, 10)
  })

  test('quality high at 1024x1024 matches the measured anchor (~$0.211)', () => {
    const cost = estimateCost({
      model: 'gpt-image-2',
      quality: 'high',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    // 7024 output tokens * $30.00 / 1M
    expect(cost.per_image_usd).toBeCloseTo(0.21072, 5)
  })

  test('streaming adds the flat ~$0.002 overhead', () => {
    const withoutStreaming = estimateCost({
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    const withStreaming = estimateCost({
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      streaming: true,
      n: 1,
    })
    // 77 output tokens * $30.00 / 1M
    expect(withStreaming.per_image_usd - withoutStreaming.per_image_usd).toBeCloseTo(0.00231, 5)
  })

  test('total_usd scales linearly with n', () => {
    const cost = estimateCost({
      model: 'gpt-image-2',
      quality: 'high',
      size: '1024x1024',
      streaming: false,
      n: 4,
    })
    expect(cost.total_usd).toBeCloseTo(cost.per_image_usd * 4, 10)
  })

  test('scales output tokens with pixel count relative to the 1024x1024 anchor', () => {
    const base = estimateCost({
      model: 'gpt-image-2',
      quality: 'high',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    const doublePixels = estimateCost({
      model: 'gpt-image-2',
      quality: 'high',
      size: '2048x1024',
      streaming: false,
      n: 1,
    })
    expect(doublePixels.per_image_usd).toBeCloseTo(base.per_image_usd * 2, 10)
  })

  test('quality auto is treated as high', () => {
    const auto = estimateCost({
      model: 'gpt-image-2',
      quality: 'auto',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    const high = estimateCost({
      model: 'gpt-image-2',
      quality: 'high',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    expect(auto).toEqual(high)
  })

  test('different models use their own output rate', () => {
    const mini = estimateCost({
      model: 'gpt-image-1-mini',
      quality: 'high',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    const gptImage2 = estimateCost({
      model: 'gpt-image-2',
      quality: 'high',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    expect(mini.per_image_usd).toBeLessThan(gptImage2.per_image_usd)
  })

  test('gpt-image-2 low 1024x1024 n=4 non-streaming is close to the measured total', () => {
    // Measured live: 4 images, quality low, 1024x1024, non-streaming, opaque
    // => total cost $0.02625. The estimator ignores input tokens, so it
    // targets the output-only figure: 196 * 4 tokens @ $30/M = $0.02352.
    const cost = estimateCost({
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      streaming: false,
      n: 4,
    })
    expect(cost.total_usd).toBeCloseTo(0.0235, 3)
  })

  test('gpt-image-1.5 low 1024x1024 n=4 non-streaming reflects the measured per-model anchor', () => {
    // Measured live: 4 images, quality low, 1024x1024, non-streaming,
    // transparent => total cost $0.057764, usage.output_tokens: 1717
    // (~429/image). The estimator targets 429 * 4 tokens @ $32/M = $0.05491,
    // materially closer to the measured total than the old shared-anchor
    // estimate of ~$0.0251 would have been.
    const cost = estimateCost({
      model: 'gpt-image-1.5',
      quality: 'low',
      size: '1024x1024',
      streaming: false,
      n: 4,
    })
    expect(cost.total_usd).toBeCloseTo(0.0549, 3)
  })

  test('gpt-image-1.5 low anchor is strictly greater than gpt-image-2 low anchor', () => {
    // Regression guard: the two models must never collapse back into one
    // shared token-anchor table.
    const gptImage15 = estimateCost({
      model: 'gpt-image-1.5',
      quality: 'low',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    const gptImage2 = estimateCost({
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      streaming: false,
      n: 1,
    })
    expect(gptImage15.per_image_usd).toBeGreaterThan(gptImage2.per_image_usd)
  })
})

describe('sizeToPixels', () => {
  test('falls back to the 1024x1024 base for auto/unparsable sizes', () => {
    expect(sizeToPixels('auto')).toBe(1024 * 1024)
    expect(sizeToPixels('not-a-size')).toBe(1024 * 1024)
  })

  test('parses WxH sizes', () => {
    expect(sizeToPixels('2560x1440')).toBe(2560 * 1440)
  })
})
