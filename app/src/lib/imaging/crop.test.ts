import { describe, expect, test } from 'bun:test'
import { clampRect, contentBounds, cropImage } from './crop'
import { createImage, createMask, getRgba, setAlpha, setRgba } from './pixel'

describe('clampRect', () => {
  test('clamps a rect that overhangs the image bounds', () => {
    expect(clampRect({ x: -5, y: -5, width: 20, height: 20 }, 10, 10)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
  })

  test('leaves an in-bounds rect unchanged', () => {
    expect(clampRect({ x: 2, y: 3, width: 4, height: 5 }, 10, 10)).toEqual({
      x: 2,
      y: 3,
      width: 4,
      height: 5,
    })
  })
})

describe('cropImage', () => {
  test('extracts the requested sub-region', () => {
    const src = createImage(4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        setRgba(src, x, y, x * 10, y * 10, 0, 255)
      }
    }

    const cropped = cropImage(src, { x: 1, y: 1, width: 2, height: 2 })
    expect(cropped.width).toBe(2)
    expect(cropped.height).toBe(2)
    expect(getRgba(cropped, 0, 0)).toEqual([10, 10, 0, 255])
    expect(getRgba(cropped, 1, 1)).toEqual([20, 20, 0, 255])
  })
})

describe('contentBounds', () => {
  test('finds the bounding box of pixels above the threshold', () => {
    const mask = createMask(10, 10)
    setAlpha(mask, 3, 4, 255)
    setAlpha(mask, 6, 7, 255)
    expect(contentBounds(mask)).toEqual({ x: 3, y: 4, width: 4, height: 4 })
  })

  test('returns a zero-size rect when nothing clears the threshold', () => {
    const mask = createMask(10, 10)
    expect(contentBounds(mask)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
