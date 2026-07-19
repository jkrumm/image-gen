import { describe, expect, test } from 'bun:test'
import { deltaE76, deltaE76FromSrgb, sampleSeedColor, srgbToLab } from './color'
import { createImage, setRgba } from './pixel'
import type { Rgb } from './types'

describe('srgbToLab / deltaE76', () => {
  test('identical colors have zero delta', () => {
    const lab = srgbToLab([120, 60, 200])
    expect(deltaE76(lab, lab)).toBeCloseTo(0, 10)
  })

  test('black vs white is a large delta (L* spans ~0 to 100)', () => {
    const black = srgbToLab([0, 0, 0])
    const white = srgbToLab([255, 255, 255])
    expect(deltaE76(black, white)).toBeGreaterThan(90)
  })

  test('near-white colors (gpt-image drift) are well under the JND-scaled range', () => {
    const a = srgbToLab([253, 253, 253])
    const b = srgbToLab([254, 254, 254])
    expect(deltaE76(a, b)).toBeLessThan(2.3)
  })

  test('is symmetric', () => {
    const a = srgbToLab([200, 50, 30])
    const b = srgbToLab([30, 180, 90])
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10)
  })
})

describe('sampleSeedColor', () => {
  test('returns the per-channel median of a 3x3 patch', () => {
    const img = createImage(3, 3)
    const values: [number, number, number][] = [
      [10, 10, 10],
      [20, 20, 20],
      [30, 30, 30],
      [40, 40, 40],
      [200, 200, 200], // center — the outlier
      [60, 60, 60],
      [70, 70, 70],
      [80, 80, 80],
      [90, 90, 90],
    ]
    let i = 0
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const [r, g, b] = values[i] ?? [0, 0, 0]
        setRgba(img, x, y, r, g, b, 255)
        i++
      }
    }

    // Sorted: 10,20,30,40,60,70,80,90,200 -> median (5th) is 60, not the 200 outlier.
    expect(sampleSeedColor(img, { x: 1, y: 1 })).toEqual([60, 60, 60])
  })

  test('clamps the patch to image bounds at a corner', () => {
    const img = createImage(4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        setRgba(img, x, y, 100, 150, 200, 255)
      }
    }
    expect(sampleSeedColor(img, { x: 0, y: 0 })).toEqual([100, 150, 200])
  })
})

describe('deltaE76FromSrgb', () => {
  test('is exactly equivalent to the allocating composed form it replaces', () => {
    // The hot loop in background.ts uses this instead of deltaE76(srgbToLab([r,g,b]), lab) to
    // avoid two array allocations per pixel. If it ever drifts from the readable form, matting
    // silently changes. Cover the extremes and the sRGB linear-segment knee (~10/255).
    const target = srgbToLab([253, 253, 253])
    const samples: Rgb[] = [
      [0, 0, 0],
      [255, 255, 255],
      [253, 253, 253],
      [10, 10, 10],
      [11, 11, 11],
      [233, 216, 221],
      [2, 8, 51],
      [20, 120, 40],
      [128, 64, 192],
    ]
    for (const rgb of samples) {
      expect(deltaE76FromSrgb(rgb[0], rgb[1], rgb[2], target)).toBeCloseTo(
        deltaE76(srgbToLab(rgb), target),
        10,
      )
    }
  })
})
