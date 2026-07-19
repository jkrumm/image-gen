import { describe, expect, test } from 'bun:test'
import { backgroundAlpha } from './background'
import { defringe, featherMask, fillHoles, morphMask, removeSpecks } from './maskops'
import { createImage, createMask, getAlpha, getRgba, setAlpha, setRgba } from './pixel'

function totalAlpha(mask: { data: Uint8ClampedArray }): number {
  let sum = 0
  for (const v of mask.data) sum += v
  return sum
}

describe('fillHoles', () => {
  test('closes an interior hole but never the border-connected background', () => {
    const size = 20
    const mask = createMask(size, size)
    // A 16x16 foreground blob with a 2px background margin, plus a 4x4 hole punched in the
    // middle of the blob.
    for (let y = 2; y < 18; y++) {
      for (let x = 2; x < 18; x++) {
        setAlpha(mask, x, y, 255)
      }
    }
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 12; x++) {
        setAlpha(mask, x, y, 0)
      }
    }

    const filled = fillHoles(mask, 1000)

    // The interior hole is closed.
    expect(getAlpha(filled, 9, 9)).toBe(255)
    expect(getAlpha(filled, 10, 10)).toBe(255)
    // The surrounding background (border-connected) is untouched, even though minArea is huge.
    expect(getAlpha(filled, 0, 0)).toBe(0)
    expect(getAlpha(filled, size - 1, size - 1)).toBe(0)
  })

  test('leaves an enclosed near-white highlight alone: backgroundAlpha never punched it out', () => {
    // `backgroundAlpha` floods from the seeds, so an enclosed highlight is never reached and stays
    // opaque on its own — fillHoles has nothing to repair here. This used to rely on fillHoles
    // restoring a hole the threshold had punched, which only worked when `minArea` happened to
    // exceed the highlight's area; a real icon's highlight (a wizard's beard: ~10⁴ px against the
    // recipe's default minArea of 64) would have been destroyed. Reachability needs no such tuning.
    const size = 24
    const img = createImage(size, size)
    const bg: [number, number, number] = [253, 253, 253]
    const subject: [number, number, number] = [20, 120, 40] // saturated green, far from bg in LAB
    const highlight: [number, number, number] = [250, 250, 250] // near-white, close to bg in LAB

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        setRgba(img, x, y, bg[0], bg[1], bg[2], 255)
      }
    }
    for (let y = 4; y < 20; y++) {
      for (let x = 4; x < 20; x++) {
        setRgba(img, x, y, subject[0], subject[1], subject[2], 255)
      }
    }
    for (let y = 10; y < 14; y++) {
      for (let x = 10; x < 14; x++) {
        setRgba(img, x, y, highlight[0], highlight[1], highlight[2], 255)
      }
    }

    const seeds = [
      { x: 0, y: 0 },
      { x: size - 1, y: 0 },
      { x: 0, y: size - 1 },
      { x: size - 1, y: size - 1 },
    ]
    const removed = backgroundAlpha(img, { seeds, tolerance: 5, softness: 3 })

    // The enclosed highlight survives removal itself, despite being ~the seed color.
    expect(getAlpha(removed, 11, 11)).toBe(255)
    // The true (border-connected) background clears, and the subject stays foreground.
    expect(getAlpha(removed, 0, 0)).toBe(0)
    expect(getAlpha(removed, 5, 5)).toBe(255)

    // fillHoles at the recipe's default minArea is a no-op for it — nothing to repair.
    const filled = fillHoles(removed, 64)
    expect(getAlpha(filled, 11, 11)).toBe(255)
    expect(getAlpha(filled, 0, 0)).toBe(0)
  })
})

describe('removeSpecks', () => {
  test('minArea 0 is identity', () => {
    const mask = createMask(10, 10)
    for (let i = 0; i < mask.data.length; i++) {
      mask.data[i] = (i * 37) % 256
    }
    const result = removeSpecks(mask, 0)
    expect(Array.from(result.data)).toEqual(Array.from(mask.data))
  })

  test('removes a small isolated speck but keeps a large blob', () => {
    const mask = createMask(20, 20)
    // Large blob.
    for (let y = 2; y < 18; y++) {
      for (let x = 2; x < 10; x++) setAlpha(mask, x, y, 255)
    }
    // Small 2x2 speck, isolated.
    setAlpha(mask, 15, 15, 255)
    setAlpha(mask, 16, 15, 255)
    setAlpha(mask, 15, 16, 255)
    setAlpha(mask, 16, 16, 255)

    const result = removeSpecks(mask, 10)
    expect(getAlpha(result, 5, 10)).toBe(255) // blob survives
    expect(getAlpha(result, 15, 15)).toBe(0) // speck removed
  })
})

describe('morphMask', () => {
  test('erode then dilate is ~identity in a large blob interior', () => {
    const size = 40
    const mask = createMask(size, size)
    const cx = size / 2
    const cy = size / 2
    const radius = 15
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d <= radius) setAlpha(mask, x, y, 255)
      }
    }

    const opened = morphMask(morphMask(mask, -2), 2)
    // Well inside the blob (far from its edge), opening should not change anything.
    expect(getAlpha(opened, cx, cy)).toBe(255)
    expect(getAlpha(opened, cx + 5, cy)).toBe(255)
    expect(getAlpha(opened, cx, cy + 5)).toBe(255)
  })

  test('radius 0 is identity', () => {
    const mask = createMask(5, 5)
    setAlpha(mask, 2, 2, 200)
    const result = morphMask(mask, 0)
    expect(Array.from(result.data)).toEqual(Array.from(mask.data))
  })
})

describe('featherMask', () => {
  test('conserves total alpha within ~1%', () => {
    const size = 50
    const mask = createMask(size, size)
    for (let y = 15; y < 35; y++) {
      for (let x = 15; x < 35; x++) {
        setAlpha(mask, x, y, 255)
      }
    }

    const before = totalAlpha(mask)
    const after = totalAlpha(featherMask(mask, 2))
    expect(Math.abs(after - before) / before).toBeLessThan(0.01)
  })
})

describe('defringe', () => {
  test('recovers a known foreground color from a synthetic alpha composite within a couple LSBs', () => {
    const trueF: [number, number, number] = [200, 50, 80]
    const background: [number, number, number] = [253, 253, 253]
    const alpha = 102 // 0.4
    const af = alpha / 255

    const composite = trueF.map((f, i) => Math.round(af * f + (1 - af) * (background[i] ?? 0))) as [
      number,
      number,
      number,
    ]

    const img = createImage(1, 1)
    setRgba(img, 0, 0, composite[0], composite[1], composite[2], alpha)

    const result = defringe(img, background, 1)
    const [r, g, b] = getRgba(result, 0, 0)

    expect(Math.abs(r - trueF[0])).toBeLessThanOrEqual(2)
    expect(Math.abs(g - trueF[1])).toBeLessThanOrEqual(2)
    expect(Math.abs(b - trueF[2])).toBeLessThanOrEqual(2)
  })

  test('leaves fully transparent and fully opaque pixels untouched', () => {
    const img = createImage(2, 1)
    setRgba(img, 0, 0, 10, 20, 30, 0)
    setRgba(img, 1, 0, 40, 50, 60, 255)

    const result = defringe(img, [253, 253, 253], 1)
    expect(getRgba(result, 0, 0)).toEqual([10, 20, 30, 0])
    expect(getRgba(result, 1, 0)).toEqual([40, 50, 60, 255])
  })
})
