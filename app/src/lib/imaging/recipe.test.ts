import { describe, expect, test } from 'bun:test'
import { RECIPE_DEFAULTS, recipeSchema } from './recipe'

describe('recipeSchema', () => {
  test('parse({ v: 1 }) fills every default', () => {
    const parsed = recipeSchema.parse({ v: 1 })
    expect(parsed).toEqual(RECIPE_DEFAULTS)
    expect(parsed.crop).toEqual({ enabled: false, rect: null, autoTrim: false })
    expect(parsed.background).toEqual({
      enabled: false,
      mode: 'corners',
      seeds: [],
      tolerance: 8,
      softness: 6,
    })
    expect(parsed.maskCleanup).toEqual({
      fillHoles: true,
      fillHolesMinArea: 64,
      removeSpecks: true,
      removeSpecksMinArea: 16,
      morph: 0,
      feather: 0,
      defringeStrength: 0,
    })
    expect(parsed.transform).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
    expect(parsed.shape).toEqual({ kind: 'none', radiusPct: 0.225 })
    expect(parsed.pad).toEqual({ insetPct: 0 })
  })

  test('rejects a wrong version', () => {
    expect(() => recipeSchema.parse({ v: 2 })).toThrow()
  })

  test('JSON round-trip is identity', () => {
    const roundTripped = recipeSchema.parse(JSON.parse(JSON.stringify(RECIPE_DEFAULTS)))
    expect(roundTripped).toEqual(RECIPE_DEFAULTS)
  })

  test('a fully-specified recipe parses unchanged', () => {
    const custom = {
      v: 1 as const,
      crop: { enabled: true, rect: { x: 1, y: 2, width: 3, height: 4 }, autoTrim: false },
      background: {
        enabled: true,
        mode: 'picks' as const,
        seeds: [{ x: 0.1, y: 0.2 }],
        tolerance: 10,
        softness: 5,
      },
      maskCleanup: {
        fillHoles: false,
        fillHolesMinArea: 10,
        removeSpecks: false,
        removeSpecksMinArea: 5,
        morph: -2,
        feather: 3,
        defringeStrength: 0.5,
      },
      transform: { scale: 1.5, offsetX: 0.2, offsetY: -0.1 },
      shape: { kind: 'circle' as const, radiusPct: 0.3 },
      pad: { insetPct: 0.1 },
    }
    expect(recipeSchema.parse(JSON.parse(JSON.stringify(custom)))).toEqual(custom)
  })
})
