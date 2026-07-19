import { describe, expect, test } from 'bun:test'
import { getAlpha } from './pixel'
import { shapeMask } from './shape'

describe('shapeMask - none', () => {
  test('is fully opaque', () => {
    const mask = shapeMask(10, 10, { kind: 'none' })
    for (const v of mask.data) expect(v).toBe(255)
  })
})

describe('shapeMask - circle', () => {
  const SIZE = 200

  test('set-fraction is close to pi/4', () => {
    const mask = shapeMask(SIZE, SIZE, { kind: 'circle' })
    let sum = 0
    for (const v of mask.data) sum += v
    const fraction = sum / (255 * SIZE * SIZE)
    expect(Math.abs(fraction - Math.PI / 4)).toBeLessThan((Math.PI / 4) * 0.005)
  })

  test('is symmetric under horizontal and vertical flips', () => {
    const mask = shapeMask(64, 64, { kind: 'circle' })
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        expect(getAlpha(mask, x, y)).toBe(getAlpha(mask, 63 - x, y))
        expect(getAlpha(mask, x, y)).toBe(getAlpha(mask, x, 63 - y))
      }
    }
  })

  test('center is opaque, corners are transparent', () => {
    const mask = shapeMask(64, 64, { kind: 'circle' })
    expect(getAlpha(mask, 32, 32)).toBe(255)
    expect(getAlpha(mask, 0, 0)).toBe(0)
    expect(getAlpha(mask, 63, 0)).toBe(0)
    expect(getAlpha(mask, 0, 63)).toBe(0)
    expect(getAlpha(mask, 63, 63)).toBe(0)
  })
})

function expectSymmetric(width: number, height: number, spec: Parameters<typeof shapeMask>[2]) {
  const mask = shapeMask(width, height, spec)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      expect(getAlpha(mask, x, y)).toBe(getAlpha(mask, width - 1 - x, y))
      expect(getAlpha(mask, x, y)).toBe(getAlpha(mask, x, height - 1 - y))
    }
  }
}

describe('shapeMask - roundedRect / appleSquircle', () => {
  const SIZE = 64
  const RADIUS_PCT = 0.225

  test('roundedRect is symmetric under both flips', () => {
    expectSymmetric(SIZE, SIZE, { kind: 'roundedRect', radiusPct: RADIUS_PCT })
  })

  test('appleSquircle is symmetric under both flips', () => {
    expectSymmetric(SIZE, SIZE, { kind: 'appleSquircle', radiusPct: RADIUS_PCT })
  })

  test('center is opaque, sharp corners are fully transparent', () => {
    for (const kind of ['roundedRect', 'appleSquircle'] as const) {
      const mask = shapeMask(SIZE, SIZE, { kind, radiusPct: RADIUS_PCT })
      expect(getAlpha(mask, SIZE / 2, SIZE / 2)).toBe(255)
      expect(getAlpha(mask, 0, 0)).toBe(0)
      expect(getAlpha(mask, SIZE - 1, 0)).toBe(0)
      expect(getAlpha(mask, 0, SIZE - 1)).toBe(0)
      expect(getAlpha(mask, SIZE - 1, SIZE - 1)).toBe(0)
    }
  })

  test('appleSquircle differs measurably from a circular roundedRect at the same radius (proves the Bezier path, not an arc)', () => {
    const squircle = shapeMask(SIZE, SIZE, { kind: 'appleSquircle', radiusPct: RADIUS_PCT })
    const roundedRect = shapeMask(SIZE, SIZE, { kind: 'roundedRect', radiusPct: RADIUS_PCT })

    let mismatches = 0
    for (let i = 0; i < squircle.data.length; i++) {
      if (Math.abs((squircle.data[i] ?? 0) - (roundedRect.data[i] ?? 0)) > 10) mismatches++
    }
    // The Apple curve reaches further than the nominal radius (L ~ 1.529x vs 1x for a circular
    // fillet), so a meaningful band of corner pixels must disagree, not just a handful of
    // antialiasing rounding differences.
    expect(mismatches).toBeGreaterThan(20)
  })

  test('degenerate small-side case does not explode (radius clamped, no NaN)', () => {
    const mask = shapeMask(4, 4, { kind: 'appleSquircle', radiusPct: 0.5 })
    for (const v of mask.data) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }

    const roundedRect = shapeMask(3, 7, { kind: 'roundedRect', radiusPct: 0.5 })
    for (const v of roundedRect.data) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})
