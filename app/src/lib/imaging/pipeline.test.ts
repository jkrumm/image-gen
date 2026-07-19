import { describe, expect, test } from 'bun:test'
import { sampleSeedColor } from './color'
import { clampRect, cropImage } from './crop'
import { makeGlowIcon } from './fixtures'
import { applyAlpha, defringe } from './maskops'
import { createImage, setRgba } from './pixel'
import { padImage } from './pad'
import { applyRecipe, buildAlpha } from './pipeline'
import { recipeSchema } from './recipe'
import type { RgbaImage } from './types'

describe('applyRecipe', () => {
  test('equals the manually-chained stages byte-for-byte', () => {
    const src = makeGlowIcon({ width: 40, height: 40 })
    const recipe = recipeSchema.parse({
      v: 1,
      crop: { enabled: true, rect: { x: 2, y: 2, width: 36, height: 36 }, autoTrim: false },
      background: { enabled: true, tolerance: 5, softness: 30 },
      maskCleanup: {
        fillHoles: true,
        fillHolesMinArea: 50,
        removeSpecks: true,
        removeSpecksMinArea: 4,
        morph: 1,
        feather: 1,
        defringeStrength: 0.5,
      },
      shape: { kind: 'appleSquircle', radiusPct: 0.225 },
      pad: { insetPct: 0.05 },
    })

    const viaPipeline = applyRecipe(src, recipe)

    // Manual chain, mirroring applyRecipe's own composition through the same public API —
    // pins that the two entry points (applyRecipe / buildAlpha) can't silently drift apart.
    const rect = recipe.crop.rect ?? { x: 0, y: 0, width: src.width, height: src.height }
    let img = cropImage(src, clampRect(rect, src.width, src.height))
    const mask = buildAlpha(img, recipe)
    const background = sampleSeedColor(img, { x: 0, y: 0 })
    img = defringe(img, background, recipe.maskCleanup.defringeStrength)
    img = applyAlpha(img, mask)
    img = padImage(img, recipe.pad.insetPct)

    expect(viaPipeline.width).toBe(img.width)
    expect(viaPipeline.height).toBe(img.height)
    expect(Array.from(viaPipeline.data)).toEqual(Array.from(img.data))
  })

  test('a no-op recipe (all defaults) only intersects with the default (full) shape mask', () => {
    const src = makeGlowIcon({ width: 16, height: 16 })
    const recipe = recipeSchema.parse({ v: 1 })
    const result = applyRecipe(src, recipe)
    expect(result.width).toBe(src.width)
    expect(result.height).toBe(src.height)
    // No background removal, no shape -> alpha stays fully opaque.
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255)
    }
  })
})

describe('buildAlpha', () => {
  test('applies the shape mask even with every other stage disabled', () => {
    const src = makeGlowIcon({ width: 32, height: 32 })
    const recipe = recipeSchema.parse({
      v: 1,
      maskCleanup: { fillHoles: false, removeSpecks: false },
      shape: { kind: 'circle' },
    })
    const mask = buildAlpha(src, recipe)
    expect(mask.data[0]).toBe(0) // corner, outside the circle
  })

  test("'picks' mode floods from a user seed instead of the image corners", () => {
    // A flat white field with a dark 4x4 "island" in the middle, not touching any edge. A
    // corner-seeded flood fills the white field but is walled off from the island (huge ΔE) —
    // the island stays foreground. A pick placed ON the island floods only the island (walled
    // off from the white field the same way) — the reverse result.
    const width = 20
    const height = 20
    const src = createImage(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const onIsland = x >= 8 && x <= 11 && y >= 8 && y <= 11
        const shade = onIsland ? 10 : 250
        setRgba(src, x, y, shade, shade, shade, 255)
      }
    }

    const cornersRecipe = recipeSchema.parse({
      v: 1,
      background: { enabled: true, mode: 'corners', tolerance: 5, softness: 0 },
      maskCleanup: { fillHoles: false, removeSpecks: false },
    })
    const cornersMask = buildAlpha(src, cornersRecipe)
    expect(cornersMask.data[maskAt(width, 0, 0)]).toBe(0) // white field cleared
    expect(cornersMask.data[maskAt(width, 10, 10)]).toBe(255) // island untouched

    const picksRecipe = recipeSchema.parse({
      v: 1,
      background: {
        enabled: true,
        mode: 'picks',
        seeds: [{ x: 0.5, y: 0.5 }],
        tolerance: 5,
        softness: 0,
      },
      maskCleanup: { fillHoles: false, removeSpecks: false },
    })
    const picksMask = buildAlpha(src, picksRecipe)
    expect(picksMask.data[maskAt(width, 10, 10)]).toBe(0) // island cleared by the pick
    expect(picksMask.data[maskAt(width, 0, 0)]).toBe(255) // white field unreachable from that seed
  })
})

describe('transform integration', () => {
  test('transform shifts the artwork before the shape stage clips it', () => {
    const width = 20
    const height = 20
    const src = createImage(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) setRgba(src, x, y, 200, 200, 200, 255)
    }
    // Marker well outside a centered circle inscribed in the 20x20 canvas.
    setRgba(src, 1, 1, 10, 20, 30, 255)

    const withoutTransform = recipeSchema.parse({ v: 1, shape: { kind: 'circle' } })
    const untransformedResult = applyRecipe(src, withoutTransform)
    const [, , , untransformedAlpha] = pixelAt(untransformedResult, 1, 1)
    expect(untransformedAlpha).toBe(0)

    // Shift the artwork so the marker (originally at (1,1)) lands under the canvas center,
    // which the circle always covers -- proves the shape masks the *transformed* artwork.
    const withTransform = recipeSchema.parse({
      v: 1,
      shape: { kind: 'circle' },
      transform: { scale: 1, offsetX: 0.45, offsetY: 0.45 },
    })
    const transformedResult = applyRecipe(src, withTransform)
    expect(pixelAt(transformedResult, 10, 10)).toEqual([10, 20, 30, 255])
  })
})

function pixelAt(img: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0, img.data[i + 3] ?? 0]
}

function maskAt(width: number, x: number, y: number): number {
  return y * width + x
}
