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
