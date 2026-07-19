import { describe, expect, test } from 'bun:test'
import { padImage, resizeImage } from './pad'
import { createImage, getRgba, setRgba } from './pixel'

describe('resizeImage', () => {
  test('same-size is identity', () => {
    const src = createImage(4, 4)
    setRgba(src, 1, 1, 10, 20, 30, 255)
    const result = resizeImage(src, 4, 4)
    expect(Array.from(result.data)).toEqual(Array.from(src.data))
  })

  test('downsampling a flat color image keeps the same color', () => {
    const src = createImage(8, 8)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) setRgba(src, x, y, 120, 60, 200, 255)
    }
    const result = resizeImage(src, 4, 4)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(getRgba(result, x, y)).toEqual([120, 60, 200, 255])
      }
    }
  })

  test('upsampling a flat color image keeps the same color and correct dimensions', () => {
    const src = createImage(2, 2)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) setRgba(src, x, y, 50, 100, 150, 255)
    }
    const result = resizeImage(src, 6, 6)
    expect(result.width).toBe(6)
    expect(result.height).toBe(6)
    expect(getRgba(result, 3, 3)).toEqual([50, 100, 150, 255])
  })
})

describe('padImage', () => {
  test('insetPct 0 is identity', () => {
    const src = createImage(10, 10)
    setRgba(src, 5, 5, 1, 2, 3, 255)
    const result = padImage(src, 0)
    expect(Array.from(result.data)).toEqual(Array.from(src.data))
  })

  test('adds a transparent margin and keeps canvas size unchanged', () => {
    const size = 20
    const src = createImage(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) setRgba(src, x, y, 10, 20, 30, 255)
    }

    const result = padImage(src, 0.2)
    expect(result.width).toBe(size)
    expect(result.height).toBe(size)

    // Corners fall in the new transparent margin.
    expect(getRgba(result, 0, 0)[3]).toBe(0)
    expect(getRgba(result, size - 1, size - 1)[3]).toBe(0)
    // Center still carries the (scaled) content.
    const [, , , centerAlpha] = getRgba(result, size / 2, size / 2)
    expect(centerAlpha).toBe(255)
  })
})
